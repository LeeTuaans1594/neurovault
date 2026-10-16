"""
NEUROVAULT — Concept Extractor v3 (White-Box, LLM-Enhanced)
Trích xuất key concepts từ text sử dụng TF-IDF + LLM + quality filtering.

v3 Improvements:
- LLM-assisted concept extraction (when available)
- Improved scoring with position/frequency/specificity bonuses
- Concept relationship detection (is-a, part-of, causes)
- Quality filtering (remove noise, single chars, numbers-only)
- Definition extraction from text patterns
- Expanded stopwords (EN + VI)
- Context snippet for each concept
100% tự viết.
"""

import re
import math
import json
import logging
from collections import Counter
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Extended stopwords — EN + VI
_STOPWORDS_EN = {
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'must', 'need',
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'over', 'upon', 'out', 'up', 'down', 'off',
    'and', 'or', 'but', 'not', 'nor', 'yet', 'so', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too',
    'very', 'just', 'also', 'then', 'now', 'here', 'there', 'when',
    'where', 'why', 'how', 'which', 'who', 'whom', 'what', 'that',
    'this', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them',
    'his', 'her', 'their', 'my', 'your', 'our', 'we', 'you', 'me', 'us',
    'i', 'am', 'if', 'as', 'no', 'much', 'well', 'still', 'even',
    'however', 'therefore', 'thus', 'hence', 'although', 'though',
    'while', 'because', 'since', 'unless', 'until', 'whether',
    'like', 'many', 'often', 'always', 'never', 'sometimes', 'usually',
    'really', 'quite', 'rather', 'already', 'perhaps', 'probably',
    'get', 'got', 'make', 'made', 'take', 'took', 'give', 'gave',
    'come', 'came', 'go', 'went', 'say', 'said', 'see', 'saw',
    'know', 'knew', 'think', 'thought', 'find', 'found', 'tell', 'told',
    'become', 'became', 'leave', 'left', 'put', 'keep', 'kept',
    'let', 'begin', 'began', 'seem', 'help', 'show', 'showed',
    'use', 'used', 'using', 'include', 'including', 'included',
    'different', 'important', 'new', 'old', 'large', 'small',
    'high', 'low', 'long', 'short', 'right', 'left', 'good', 'bad',
    'first', 'last', 'next', 'following', 'previous', 'example',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'number', 'part', 'case', 'point', 'time',
    'way', 'thing', 'day', 'year', 'people', 'work', 'world',
    'hand', 'end', 'place', 'form', 'fact', 'general', 'specific',
    'figure', 'table', 'chapter', 'section', 'page', 'note',
    'result', 'order', 'called', 'known', 'based', 'given',
    'according', 'refer', 'related', 'described', 'shown',
}

_STOPWORDS_VI = {
    'là', 'và', 'của', 'có', 'trong', 'được', 'cho', 'này', 'với',
    'các', 'không', 'một', 'những', 'đã', 'để', 'từ', 'theo', 'về',
    'như', 'khi', 'cũng', 'tại', 'thì', 'hay', 'hoặc', 'mà', 'vì',
    'nên', 'nếu', 'do', 'bởi', 'đến', 'ra', 'lại', 'trên', 'dưới',
    'giữa', 'sau', 'trước', 'qua', 'rồi', 'vẫn', 'đang', 'sẽ',
    'bị', 'phải', 'cần', 'muốn', 'hơn', 'nhất', 'rất', 'quá',
    'chỉ', 'còn', 'nhiều', 'ít', 'mỗi', 'đều', 'tất cả', 'nào',
    'đây', 'đó', 'kia', 'ấy', 'sao', 'thế', 'vậy', 'gì', 'ai',
    'bao', 'mấy', 'nơi', 'lúc', 'nhưng', 'dù', 'tuy', 'song',
    'đã', 'từng', 'vừa', 'mới', 'hay', 'luôn', 'thường', 'bao giờ',
    'chưa', 'chẳng', 'đâu', 'không phải', 'chính', 'riêng',
    'ngoài', 'cùng', 'việc', 'điều', 'người', 'cách',
    'thêm', 'nữa', 'khác', 'bên', 'phía', 'sau đó', 'trước đó',
}

_STOPWORDS = _STOPWORDS_EN | _STOPWORDS_VI


class ConceptExtractor:
    """
    Keyphrase extraction v3: TF-IDF + position scoring + LLM enhancement.
    Produces concepts with definitions, context, and quality scores.
    """

    def __init__(
        self,
        max_concepts: int = 20,
        min_word_freq: int = 1,
        llm_engine=None,
    ):
        self.max_concepts = max_concepts
        self.min_word_freq = min_word_freq
        self.llm = llm_engine
        self._stopwords = _STOPWORDS

    def extract(self, text: str, chunks: List[str] = None) -> List[Dict]:
        """
        Extract key concepts from text.
        Returns: [{"concept": str, "score": float, "frequency": int,
                   "definition": str, "context": str}, ...]
        """
        if not text or len(text.strip()) < 20:
            return []

        # Strategy 1: LLM-first (best quality)
        llm_concepts = []
        if self.llm and hasattr(self.llm, 'is_available') and self.llm.is_available():
            llm_concepts = self._extract_with_llm(text)
            if len(llm_concepts) >= self.max_concepts:
                return llm_concepts[:self.max_concepts]

        # Strategy 2: Rule-based TF-IDF + ngrams
        rule_concepts = self._extract_rule_based(text, chunks)

        # Merge: LLM concepts first (higher quality), supplement with rule-based
        merged = self._merge_concepts(llm_concepts, rule_concepts)

        # Extract definitions for top concepts
        definitions = self.extract_definitions(text)
        def_map = {d["concept"].lower(): d["definition"] for d in definitions}

        # Enrich concepts with context + definitions
        for concept in merged:
            name = concept["concept"]
            concept["definition"] = def_map.get(name.lower(), "")
            if not concept.get("context"):
                concept["context"] = self._extract_context_snippet(name, text)

        return merged[:self.max_concepts]

    def _extract_with_llm(self, text: str) -> List[Dict]:
        """Use LLM to extract high-quality concepts with definitions."""
        try:
            # Detect language
            vi_chars = sum(1 for c in text if '\u00C0' <= c <= '\u1EFF')
            is_vi = vi_chars / max(len(text), 1) > 0.05

            sample = text[:2000]

            if is_vi:
                prompt = (
                    f"Trích xuất các KHÁI NIỆM QUAN TRỌNG từ đoạn văn bản sau.\n"
                    f"Chỉ trả về JSON array, không thêm text nào khác.\n\n"
                    f"Văn bản:\n{sample}\n\n"
                    f"Trả về JSON array với format:\n"
                    f'[{{"concept":"tên khái niệm","definition":"định nghĩa ngắn 1-2 câu","importance":"high/medium/low"}}]\n'
                    f"Quy tắc:\n"
                    f"- Chỉ lấy khái niệm THỰC SỰ quan trọng (thuật ngữ chuyên môn, khái niệm cốt lõi)\n"
                    f"- KHÔNG lấy từ chung chung (ví dụ: nghiên cứu, phương pháp, kết quả)\n"
                    f"- Tối đa {self.max_concepts} khái niệm\n"
                    f"JSON:"
                )
            else:
                prompt = (
                    f"Extract the KEY CONCEPTS from this text.\n"
                    f"Return ONLY a JSON array, no other text.\n\n"
                    f"Text:\n{sample}\n\n"
                    f"Return JSON array with format:\n"
                    f'[{{"concept":"concept name","definition":"1-2 sentence definition","importance":"high/medium/low"}}]\n'
                    f"Rules:\n"
                    f"- Only extract genuinely important concepts (technical terms, core ideas)\n"
                    f"- Do NOT extract generic words (e.g. research, method, result)\n"
                    f"- Maximum {self.max_concepts} concepts\n"
                    f"JSON:"
                )

            result = self.llm.generate(
                prompt=prompt,
                system="You are a concept extraction expert. Return ONLY valid JSON arrays.",
                temperature=0.3,
                max_tokens=1500,
            )

            if not result or result.startswith("[ERROR]"):
                return []

            parsed = self._parse_llm_concepts(result, text)
            if parsed:
                logger.info(f"[ConceptExtractor] LLM extracted {len(parsed)} concepts")
            return parsed

        except Exception as e:
            logger.warning(f"[ConceptExtractor] LLM extraction failed: {e}")
            return []

    def _parse_llm_concepts(self, raw: str, full_text: str) -> List[Dict]:
        """Parse LLM JSON output into concept dicts."""
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)

        start = raw.find('[')
        end = raw.rfind(']')
        if start == -1 or end == -1 or end <= start:
            return []

        try:
            concepts = json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            return []

        if not isinstance(concepts, list):
            return []

        valid = []
        importance_scores = {"high": 1.0, "medium": 0.7, "low": 0.4}

        for c in concepts:
            if not isinstance(c, dict):
                continue
            name = str(c.get("concept", "")).strip()
            if not name or len(name) < 2 or len(name) > 80:
                continue
            # Skip if concept not actually in text (hallucination check)
            if name.lower() not in full_text.lower():
                continue

            importance = str(c.get("importance", "medium")).lower()
            score = importance_scores.get(importance, 0.5)
            freq = full_text.lower().count(name.lower())

            valid.append({
                "concept": name,
                "score": score * (1 + min(freq, 10) * 0.05),
                "frequency": max(freq, 1),
                "definition": str(c.get("definition", "")).strip(),
                "context": self._extract_context_snippet(name, full_text),
                "llm_extracted": True,
            })

        # Sort by score
        valid.sort(key=lambda x: x["score"], reverse=True)
        return valid

    def _extract_rule_based(self, text: str, chunks: List[str] = None) -> List[Dict]:
        """Rule-based concept extraction with improved scoring."""
        tokens = self._tokenize(text)
        if not tokens:
            return []

        sentences = re.split(r'[.!?。]+', text)
        total_sents = max(len(sentences), 1)

        # Single word TF-IDF scores
        word_scores = self._compute_tfidf(tokens, chunks or [text])

        # Extract ngrams with improved filtering
        ngram_scores = self._extract_ngrams(tokens, word_scores, text)

        # Position bonus: concepts appearing in first 20% of text get a boost
        first_portion = text[:max(int(len(text) * 0.2), 100)].lower()

        all_concepts = {}

        # Single words — higher quality threshold
        for word, score in word_scores.items():
            freq = tokens.count(word)
            if freq < self.min_word_freq:
                continue
            if self._is_low_quality(word):
                continue

            # Position bonus
            pos_bonus = 1.3 if word in first_portion else 1.0

            # Specificity bonus: longer words tend to be more specific
            spec_bonus = 1.0 + min(len(word) - 3, 5) * 0.05

            final_score = score * pos_bonus * spec_bonus

            all_concepts[word] = {
                "concept": word,
                "score": final_score,
                "frequency": freq,
                "definition": "",
                "context": "",
            }

        # Ngrams — preferred over single words
        for ngram, score in ngram_scores.items():
            if self._is_low_quality(ngram):
                continue
            freq = text.lower().count(ngram.lower())

            pos_bonus = 1.3 if ngram.lower() in first_portion else 1.0
            # Multi-word concepts are generally more valuable
            word_count = len(ngram.split())
            multi_bonus = 1.0 + word_count * 0.2

            final_score = score * pos_bonus * multi_bonus

            all_concepts[ngram] = {
                "concept": ngram,
                "score": final_score,
                "frequency": max(freq, 1),
                "definition": "",
                "context": "",
            }

        # Remove single words that are subsets of higher-scoring ngrams
        ngram_concepts = {k for k in all_concepts if ' ' in k}
        to_remove = set()
        for word in list(all_concepts.keys()):
            if ' ' not in word:  # single word
                for ng in ngram_concepts:
                    if word in ng.split() and all_concepts.get(ng, {}).get("score", 0) > all_concepts.get(word, {}).get("score", 0):
                        to_remove.add(word)
                        break

        for w in to_remove:
            del all_concepts[w]

        sorted_concepts = sorted(all_concepts.values(), key=lambda x: x["score"], reverse=True)
        return sorted_concepts

    def _merge_concepts(self, llm_concepts: List[Dict], rule_concepts: List[Dict]) -> List[Dict]:
        """Merge LLM and rule-based concepts, deduplicating by name."""
        seen = set()
        merged = []

        # LLM concepts first (higher quality)
        for c in llm_concepts:
            key = c["concept"].lower().strip()
            if key not in seen:
                seen.add(key)
                merged.append(c)

        # Supplement with rule-based
        for c in rule_concepts:
            key = c["concept"].lower().strip()
            if key not in seen:
                # Check if any existing concept contains this one or vice versa
                is_subset = False
                for existing in seen:
                    if key in existing or existing in key:
                        is_subset = True
                        break
                if not is_subset:
                    seen.add(key)
                    merged.append(c)

        return merged

    # Generic phrases that produce terrible quiz questions — too vague to test
    _GENERIC_CONCEPTS_VI = {
        'đọc sách', 'con đường', 'người trẻ', 'cuộc sống', 'cuộc đời',
        'con người', 'thế giới', 'xã hội', 'đất nước', 'quê hương',
        'tình yêu', 'niềm tin', 'ước mơ', 'lý tưởng', 'trách nhiệm',
        'tuổi trẻ', 'thanh niên', 'tương lai', 'hạnh phúc', 'thành công',
        'tác giả', 'tác phẩm', 'bài thơ', 'câu chuyện', 'nhân vật',
        'vấn đề', 'phương pháp', 'kết quả', 'nghiên cứu', 'giải pháp',
        'ý nghĩa', 'giá trị', 'vai trò', 'tầm quan trọng', 'mục đích',
        'nội dung', 'hình thức', 'đặc điểm', 'tính chất', 'bản chất',
    }
    _GENERIC_CONCEPTS_EN = {
        'the author', 'the text', 'the study', 'the method', 'the result',
        'the problem', 'the solution', 'the process', 'the system',
        'the concept', 'the idea', 'the example', 'the question',
        'this topic', 'this issue', 'the importance', 'the purpose',
    }

    def _is_low_quality(self, concept: str) -> bool:
        """Filter out low-quality concept candidates."""
        concept = concept.strip()
        # Too short or too long
        if len(concept) < 3 or len(concept) > 80:
            return True
        # Numbers only
        if re.match(r'^[\d\s.,]+$', concept):
            return True
        # Single repeated character
        if len(set(concept.replace(' ', ''))) <= 2:
            return True
        # All stopwords
        words = concept.lower().split()
        if all(w in self._stopwords for w in words):
            return True
        # Contains garbage patterns
        if re.search(r'[_\-]{3,}|\.{3,}|[<>{}]', concept):
            return True
        # Generic/vague concepts that produce bad quiz questions
        if concept.lower() in self._GENERIC_CONCEPTS_VI:
            return True
        if concept.lower() in self._GENERIC_CONCEPTS_EN:
            return True
        return False

    def _extract_context_snippet(self, concept: str, text: str, max_chars: int = 300) -> str:
        """Extract the best context snippet around a concept mention."""
        pattern = re.escape(concept)
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            return ""

        # Get a window around the match
        start = max(0, match.start() - 100)
        end = min(len(text), match.end() + 200)

        # Expand to sentence boundaries
        snippet = text[start:end]

        # Clean up: trim to nearest sentence boundary
        first_period = snippet.find('. ')
        if first_period > 0 and first_period < 50:
            snippet = snippet[first_period + 2:]

        last_period = snippet.rfind('. ')
        if last_period > 100:
            snippet = snippet[:last_period + 1]

        return snippet.strip()[:max_chars]

    def _tokenize(self, text: str) -> List[str]:
        text = text.lower()
        text = re.sub(r'[^\w\s\u00C0-\u024F\u1E00-\u1EFF]', ' ', text)
        return [w for w in text.split() if w not in self._stopwords and len(w) > 2]

    def _compute_tfidf(self, tokens: List[str], documents: List[str]) -> Dict[str, float]:
        tf = Counter(tokens)
        total = len(tokens)
        n_docs = max(len(documents), 1)

        # Document frequency
        df = Counter()
        for doc in documents:
            doc_tokens = set(self._tokenize(doc))
            df.update(doc_tokens)

        scores = {}
        for word, count in tf.items():
            if count >= self.min_word_freq:
                tf_score = count / total
                idf_score = math.log((n_docs + 1) / (df.get(word, 0) + 1)) + 1
                scores[word] = tf_score * idf_score

        return scores

    def _extract_ngrams(
        self, tokens: List[str], word_scores: Dict[str, float], full_text: str
    ) -> Dict[str, float]:
        """Extract ngrams with improved quality filtering."""
        ngrams = {}

        # Bigrams
        for i in range(len(tokens) - 1):
            bigram = f"{tokens[i]} {tokens[i+1]}"
            s1 = word_scores.get(tokens[i], 0)
            s2 = word_scores.get(tokens[i+1], 0)
            if s1 > 0 and s2 > 0:
                # Check actual frequency in original text
                freq = full_text.lower().count(bigram)
                if freq >= 1:
                    ngrams[bigram] = ngrams.get(bigram, 0) + (s1 + s2) * 1.5 * max(freq, 1)

        # Trigrams
        for i in range(len(tokens) - 2):
            trigram = f"{tokens[i]} {tokens[i+1]} {tokens[i+2]}"
            s1 = word_scores.get(tokens[i], 0)
            s2 = word_scores.get(tokens[i+1], 0)
            s3 = word_scores.get(tokens[i+2], 0)
            if s1 > 0 and s2 > 0 and s3 > 0:
                freq = full_text.lower().count(trigram)
                if freq >= 1:
                    ngrams[trigram] = ngrams.get(trigram, 0) + (s1 + s2 + s3) * 2.0 * max(freq, 1)

        # Filter low-score ngrams
        if ngrams:
            max_score = max(ngrams.values())
            threshold = max_score * 0.1  # Keep top 90%
            ngrams = {k: v for k, v in ngrams.items() if v >= threshold}

        return ngrams

    def extract_definitions(self, text: str) -> List[Dict]:
        """Extract concept-definition pairs using pattern matching (EN + VI)."""
        patterns = [
            # English patterns
            r'(?:^|\. )([A-Z][^.]+?) (?:is|are|refers to|means|defined as) ([^.]+\.)',
            r'(?:^|\. )([A-Z][^.]+?) — ([^.]+\.)',
            r'(?:^|\. )([A-Z][^.]+?): ([^.]+\.)',
            # Vietnamese patterns
            r'(?:^|\. )([A-ZÀ-Ỹ][^.]{3,40}?)\s+(?:là|được định nghĩa là|có nghĩa là|được hiểu là)\s+([^.]{15,200})\.',
            r'(?:^|\. )([A-ZÀ-Ỹ][^.]{3,40}?)\s*[—–]\s*([^.]{15,200})\.',
        ]
        definitions = []
        seen = set()
        for pattern in patterns:
            for match in re.finditer(pattern, text):
                concept = match.group(1).strip()
                definition = match.group(2).strip()
                key = concept.lower()
                if key not in seen and len(concept) > 2 and len(definition) > 10:
                    seen.add(key)
                    definitions.append({
                        "concept": concept,
                        "definition": definition,
                    })
        return definitions

    def extract_relationships(self, concepts: List[Dict], text: str) -> List[Dict]:
        """
        Extract relationships between concepts from text.
        Returns: [{"source": str, "target": str, "relation": str}, ...]
        """
        relationships = []
        concept_names = [c["concept"] for c in concepts]

        # Pattern-based relationship extraction
        relation_patterns = [
            # EN
            (r'{A}\s+(?:is a|is an|is a type of|is a kind of)\s+{B}', 'is-a'),
            (r'{A}\s+(?:contains|includes|consists of|comprises)\s+{B}', 'has-part'),
            (r'{A}\s+(?:causes|leads to|results in|produces)\s+{B}', 'causes'),
            (r'{A}\s+(?:depends on|requires|needs)\s+{B}', 'depends-on'),
            (r'{A}\s+(?:is similar to|is like|resembles)\s+{B}', 'similar-to'),
            (r'{A}\s+(?:is different from|differs from|contrasts with)\s+{B}', 'contrasts'),
            (r'{A}\s+(?:is part of|belongs to)\s+{B}', 'part-of'),
            # VI
            (r'{A}\s+(?:là một loại|là loại|thuộc loại)\s+{B}', 'is-a'),
            (r'{A}\s+(?:bao gồm|chứa|gồm có)\s+{B}', 'has-part'),
            (r'{A}\s+(?:gây ra|dẫn đến|tạo ra)\s+{B}', 'causes'),
            (r'{A}\s+(?:phụ thuộc vào|cần|yêu cầu)\s+{B}', 'depends-on'),
        ]

        seen = set()
        for i, ca in enumerate(concept_names):
            for j, cb in enumerate(concept_names):
                if i == j:
                    continue
                for pattern_template, rel_type in relation_patterns:
                    pattern = pattern_template.replace('{A}', re.escape(ca)).replace('{B}', re.escape(cb))
                    if re.search(pattern, text, re.IGNORECASE):
                        key = f"{ca}|{cb}|{rel_type}"
                        if key not in seen:
                            seen.add(key)
                            relationships.append({
                                "source": ca,
                                "target": cb,
                                "relation": rel_type,
                            })

        # Co-occurrence based relationships (within same sentence)
        sentences = re.split(r'[.!?。]+', text)
        for sent in sentences:
            sent_lower = sent.lower()
            co_occurring = [c for c in concept_names if c.lower() in sent_lower]
            if len(co_occurring) >= 2:
                for i in range(len(co_occurring)):
                    for j in range(i + 1, len(co_occurring)):
                        key = f"{co_occurring[i]}|{co_occurring[j]}|co-occurs"
                        if key not in seen:
                            seen.add(key)
                            relationships.append({
                                "source": co_occurring[i],
                                "target": co_occurring[j],
                                "relation": "co-occurs",
                            })

        return relationships
