"""
NEUROVAULT — Summary Generator v2 (White-Box)
TextRank + MMR (Maximal Marginal Relevance) extractive summarization.
Không dùng sumy, gensim, hay bất kỳ library tóm tắt nào.

v2 Improvements:
- MMR for diversity (avoid redundant sentences)
- Section-aware summarization
- Keyword highlighting
- Abstractive fallback via LLM (when available)
- Compression ratio control
- Bilingual support (EN/VI)
"""

import re
import math
from collections import Counter
from typing import List, Dict, Optional, Tuple


class SummaryGenerator:
    """
    Extractive + Abstractive summarization v2.

    Pipeline:
    1. TextRank for sentence importance scoring
    2. MMR for diverse sentence selection
    3. LLM abstractive refinement (optional)
    """

    def __init__(
        self,
        damping: float = 0.85,
        max_iter: int = 100,
        tol: float = 1e-5,
        mmr_lambda: float = 0.7,
        llm_engine=None,
    ):
        self.damping = damping
        self.max_iter = max_iter
        self.tol = tol
        self.mmr_lambda = mmr_lambda
        self.llm = llm_engine

    def summarize(
        self,
        text: str,
        num_sentences: int = 5,
        target_compression: float = 0.3,
        use_mmr: bool = True,
    ) -> Dict:
        """
        Generate extractive summary.

        Args:
            text: Input text
            num_sentences: Max sentences in summary
            target_compression: Target ratio of summary/original length
            use_mmr: Use MMR for diversity

        Returns:
            {
                "summary": str,
                "key_sentences": List[Dict],
                "compression_ratio": float,
                "word_count_original": int,
                "word_count_summary": int,
                "keywords": List[str],
            }
        """
        sentences = self._split_sentences(text)
        if len(sentences) <= num_sentences:
            return {
                "summary": text,
                "key_sentences": [
                    {"text": s, "score": 1.0, "position": i}
                    for i, s in enumerate(sentences)
                ],
                "compression_ratio": 1.0,
                "word_count_original": len(text.split()),
                "word_count_summary": len(text.split()),
                "keywords": self._extract_keywords(text, top_k=10),
            }

        # Auto-adjust num_sentences based on target compression
        target_words = len(text.split()) * target_compression
        avg_sent_words = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
        auto_sentences = max(2, min(num_sentences, int(target_words / max(avg_sent_words, 1))))

        # Build similarity matrix
        tokenized = [self._tokenize(s) for s in sentences]
        sim_matrix = self._build_similarity_matrix(tokenized)

        # TextRank scoring
        scores = self._textrank(sim_matrix)

        # Select sentences
        if use_mmr:
            selected = self._mmr_select(
                sentences, tokenized, scores, auto_sentences
            )
        else:
            # Simple top-K by score
            scored = [(i, scores[i], s) for i, s in enumerate(sentences)]
            scored.sort(key=lambda x: x[1], reverse=True)
            selected = scored[:auto_sentences]
            # Re-sort by position
            selected.sort(key=lambda x: x[0])

        key_sentences = [
            {"text": s.strip(), "score": round(sc, 4), "position": i}
            for i, sc, s in selected
        ]

        summary = " ".join([ks["text"] for ks in key_sentences])
        keywords = self._extract_keywords(text, top_k=10)

        return {
            "summary": summary,
            "key_sentences": key_sentences,
            "compression_ratio": round(len(summary) / max(len(text), 1), 3),
            "word_count_original": len(text.split()),
            "word_count_summary": len(summary.split()),
            "keywords": keywords,
        }

    def abstractive_summarize(
        self,
        text: str,
        max_words: int = 200,
        language: str = "en",
    ) -> Dict:
        """
        LLM-based abstractive summarization.
        Falls back to extractive if LLM unavailable.
        Supports Vietnamese and English.
        """
        if not self.llm or not hasattr(self.llm, 'is_available') or not self.llm.is_available():
            return self.summarize(text, num_sentences=5)

        if language == "vi":
            prompt = f"""Tóm tắt văn bản sau đây trong {max_words} từ hoặc ít hơn.
Giữ phần tóm tắt mang tính giáo dục, rõ ràng và có cấu trúc.
Sử dụng bullet points cho các khái niệm chính.
Bạn PHẢI trả lời bằng TIẾNG VIỆT.

Văn bản:
{text[:3000]}

Tóm tắt:"""
            system_msg = "Bạn là chuyên gia tóm tắt. Tạo các bản tóm tắt ngắn gọn, mang tính giáo dục bằng tiếng Việt."
        else:
            prompt = f"""Summarize the following text in {max_words} words or fewer.
Keep the summary educational, clear, and well-structured.
Use bullet points for key concepts.

Text:
{text[:3000]}

Summary:"""
            system_msg = "You are an expert summarizer. Create concise, educational summaries."

        try:
            summary = self.llm.generate(
                prompt=prompt,
                system=system_msg,
                temperature=0.3,
                max_tokens=max_words * 2,
            )

            if summary and not summary.startswith("[ERROR]"):
                keywords = self._extract_keywords(text, top_k=10)
                return {
                    "summary": summary.strip(),
                    "key_sentences": [],
                    "compression_ratio": round(len(summary) / max(len(text), 1), 3),
                    "word_count_original": len(text.split()),
                    "word_count_summary": len(summary.split()),
                    "keywords": keywords,
                    "method": "abstractive",
                }
        except Exception:
            pass

        return self.summarize(text, num_sentences=5)

    # ──── MMR Selection ────

    def _mmr_select(
        self,
        sentences: List[str],
        tokenized: List[List[str]],
        scores: List[float],
        k: int,
    ) -> List[Tuple[int, float, str]]:
        """
        Maximal Marginal Relevance for diverse sentence selection.

        MMR = λ * Relevance(s) - (1-λ) * max(Similarity(s, selected))

        This avoids selecting redundant sentences that say the same thing.
        """
        n = len(sentences)
        selected = []
        remaining = list(range(n))

        for _ in range(min(k, n)):
            best_idx = -1
            best_mmr = -float('inf')

            for idx in remaining:
                # Relevance = TextRank score
                relevance = scores[idx]

                # Max similarity to already selected sentences
                max_sim = 0.0
                for sel_idx, _, _ in selected:
                    sim = self._cosine_sim_tokens(tokenized[idx], tokenized[sel_idx])
                    max_sim = max(max_sim, sim)

                # MMR score
                mmr = self.mmr_lambda * relevance - (1 - self.mmr_lambda) * max_sim

                if mmr > best_mmr:
                    best_mmr = mmr
                    best_idx = idx

            if best_idx >= 0:
                selected.append((best_idx, scores[best_idx], sentences[best_idx]))
                remaining.remove(best_idx)

        # Sort by original position for coherent reading
        selected.sort(key=lambda x: x[0])
        return selected

    # ──── Keyword Extraction ────

    def _extract_keywords(self, text: str, top_k: int = 10) -> List[str]:
        """Extract top keywords using TF scoring."""
        tokens = self._tokenize(text)
        if not tokens:
            return []

        freq = Counter(tokens)
        # Filter by minimum frequency
        keywords = [
            word for word, count in freq.most_common(top_k * 3)
            if count >= 2 and len(word) > 2
        ]
        return keywords[:top_k]

    # ──── Core NLP Utilities ────

    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if len(s.strip()) > 15]

    def _tokenize(self, text: str) -> List[str]:
        text = text.lower()
        text = re.sub(r'[^\w\s\u00C0-\u024F\u1E00-\u1EFF]', ' ', text)
        stopwords = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
            'and', 'or', 'but', 'not', 'it', 'this', 'that',
            'là', 'và', 'của', 'có', 'trong', 'được', 'cho', 'này',
            'với', 'các', 'không', 'một', 'những', 'đã', 'để', 'từ',
        }
        return [w for w in text.split() if w not in stopwords and len(w) > 1]

    def _cosine_sim_tokens(self, a: List[str], b: List[str]) -> float:
        """Cosine similarity between two token lists."""
        counter_a = Counter(a)
        counter_b = Counter(b)
        all_words = set(counter_a.keys()) | set(counter_b.keys())

        dot = sum(counter_a.get(w, 0) * counter_b.get(w, 0) for w in all_words)
        mag_a = math.sqrt(sum(v ** 2 for v in counter_a.values()))
        mag_b = math.sqrt(sum(v ** 2 for v in counter_b.values()))

        if mag_a == 0 or mag_b == 0:
            return 0.0
        return dot / (mag_a * mag_b)

    def _build_similarity_matrix(self, tokenized: List[List[str]]) -> List[List[float]]:
        """Build sentence similarity matrix."""
        n = len(tokenized)
        matrix = [[0.0] * n for _ in range(n)]

        for i in range(n):
            for j in range(i + 1, n):
                sim = self._cosine_sim_tokens(tokenized[i], tokenized[j])
                matrix[i][j] = sim
                matrix[j][i] = sim

        return matrix

    def _textrank(self, sim_matrix: List[List[float]]) -> List[float]:
        """TextRank algorithm — iterative power method."""
        n = len(sim_matrix)
        if n == 0:
            return []

        scores = [1.0 / n] * n

        for _ in range(self.max_iter):
            new_scores = [0.0] * n
            for i in range(n):
                incoming = 0.0
                for j in range(n):
                    if i == j:
                        continue
                    out_sum = sum(sim_matrix[j])
                    if out_sum > 0:
                        incoming += sim_matrix[j][i] / out_sum * scores[j]

                new_scores[i] = (1 - self.damping) / n + self.damping * incoming

            diff = sum(abs(new_scores[i] - scores[i]) for i in range(n))
            scores = new_scores
            if diff < self.tol:
                break

        return scores
