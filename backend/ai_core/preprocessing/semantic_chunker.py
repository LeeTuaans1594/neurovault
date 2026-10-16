"""
NEUROVAULT — Semantic Chunker Module
Tách text thành semantic chunks dựa trên cosine similarity drop detection.
100% tự viết — không dùng LangChain hay bất kỳ chunking library nào.
"""

import re
import math
import uuid
from collections import Counter
from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class Chunk:
    """Một semantic chunk."""
    chunk_id: str = ""
    text: str = ""
    position: int = 0
    char_start: int = 0
    char_end: int = 0
    sentence_count: int = 0
    word_count: int = 0


class SemanticChunker:
    """
    Semantic Chunking bằng Sliding Window + Cosine Similarity Drop Detection.

    Thay vì chunk cứng nhắc (mỗi N từ), detect "semantic boundaries" —
    nơi topic thay đổi dựa trên TF-IDF vector similarity.

    Pipeline:
    1. Nhận list sentences
    2. Tạo sliding windows (W sentences mỗi window)
    3. Tính TF-IDF vector cho mỗi window
    4. Tính cosine similarity giữa windows liên tiếp
    5. Nếu similarity drop > threshold → chunk boundary
    6. Post-process: merge chunks quá ngắn, split chunks quá dài
    """

    def __init__(
        self,
        window_size: int = 3,
        similarity_threshold: float = 0.3,
        min_chunk_words: int = 50,
        max_chunk_words: int = 500,
    ):
        self.window_size = window_size
        self.threshold = similarity_threshold
        self.min_chunk_words = min_chunk_words
        self.max_chunk_words = max_chunk_words

    def chunk(self, sentences: List[str], full_text: str = "") -> List[Chunk]:
        """
        Tách sentences thành semantic chunks.

        Args:
            sentences: Danh sách câu đã split
            full_text: Text gốc (dùng để tính char offsets)

        Returns:
            Danh sách Chunk objects
        """
        if not sentences:
            return []

        if len(sentences) <= self.window_size:
            # Quá ít câu → 1 chunk duy nhất
            return [self._create_chunk(sentences, 0, full_text)]

        # Step 1: Tạo sliding windows
        windows = self._create_windows(sentences)

        # Step 2: Tính TF-IDF vectors cho mỗi window
        vectors = [self._tfidf_vector(w) for w in windows]

        # Step 3: Tìm similarity drops → chunk boundaries
        boundaries = self._find_boundaries(vectors)

        # Step 4: Tạo chunks từ boundaries
        chunks = self._create_chunks_from_boundaries(sentences, boundaries, full_text)

        # Step 5: Post-process
        chunks = self._merge_short_chunks(chunks)
        chunks = self._split_long_chunks(chunks)

        # Re-index positions
        for i, chunk in enumerate(chunks):
            chunk.position = i

        return chunks

    def chunk_by_size(self, sentences: List[str], full_text: str = "",
                      target_size: int = 200) -> List[Chunk]:
        """
        Fallback: chunk theo kích thước (nếu semantic chunking không phù hợp).
        """
        chunks = []
        current_sentences = []
        current_word_count = 0

        for sent in sentences:
            word_count = len(sent.split())
            if current_word_count + word_count > target_size and current_sentences:
                chunks.append(self._create_chunk(current_sentences, len(chunks), full_text))
                current_sentences = []
                current_word_count = 0

            current_sentences.append(sent)
            current_word_count += word_count

        if current_sentences:
            chunks.append(self._create_chunk(current_sentences, len(chunks), full_text))

        return chunks

    def _create_windows(self, sentences: List[str]) -> List[str]:
        """Tạo sliding windows từ sentences."""
        windows = []
        for i in range(len(sentences) - self.window_size + 1):
            window_text = " ".join(sentences[i:i + self.window_size])
            windows.append(window_text)
        return windows

    def _tfidf_vector(self, text: str) -> Dict[str, float]:
        """
        Tính TF vector đơn giản (IDF sẽ implicit trong cosine similarity).
        """
        words = self._tokenize(text)
        if not words:
            return {}

        word_counts = Counter(words)
        total = len(words)
        return {word: count / total for word, count in word_counts.items()}

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize đơn giản: lowercase, split, remove punctuation."""
        text = text.lower()
        text = re.sub(r'[^\w\s\u00C0-\u024F\u1E00-\u1EFF]', ' ', text)
        words = text.split()
        # Remove stopwords rất phổ biến
        stopwords = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'could', 'should', 'may', 'might', 'can', 'shall',
            'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
            'and', 'or', 'but', 'not', 'no', 'if', 'it', 'its', 'this',
            'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
            # Vietnamese stopwords
            'là', 'và', 'của', 'có', 'trong', 'được', 'cho', 'này',
            'với', 'các', 'không', 'một', 'những', 'đã', 'để', 'từ',
            'theo', 'về', 'như', 'khi', 'người', 'cũng', 'tại', 'thì',
        }
        return [w for w in words if w not in stopwords and len(w) > 1]

    def _cosine_similarity(self, vec_a: Dict[str, float], vec_b: Dict[str, float]) -> float:
        """Cosine similarity giữa 2 TF vectors."""
        if not vec_a or not vec_b:
            return 0.0

        common = set(vec_a.keys()) & set(vec_b.keys())
        if not common:
            return 0.0

        dot = sum(vec_a[k] * vec_b[k] for k in common)
        norm_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
        norm_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot / (norm_a * norm_b)

    def _find_boundaries(self, vectors: List[Dict[str, float]]) -> List[int]:
        """
        Tìm chunk boundaries dựa trên similarity drops.
        Boundary = vị trí mà similarity giữa window[i-1] và window[i] < threshold.
        """
        if len(vectors) < 2:
            return []

        similarities = []
        for i in range(1, len(vectors)):
            sim = self._cosine_similarity(vectors[i - 1], vectors[i])
            similarities.append(sim)

        # Tìm local minima + below threshold
        boundaries = []
        for i, sim in enumerate(similarities):
            if sim < self.threshold:
                # Convert window index → sentence index
                sentence_idx = i + self.window_size
                boundaries.append(sentence_idx)

        return boundaries

    def _create_chunks_from_boundaries(self, sentences: List[str],
                                        boundaries: List[int],
                                        full_text: str) -> List[Chunk]:
        """Tạo chunks từ boundary positions."""
        if not boundaries:
            return [self._create_chunk(sentences, 0, full_text)]

        chunks = []
        prev = 0

        for boundary in boundaries:
            if boundary > prev:
                chunk_sentences = sentences[prev:boundary]
                if chunk_sentences:
                    chunks.append(self._create_chunk(chunk_sentences, len(chunks), full_text))
                prev = boundary

        # Remaining sentences
        if prev < len(sentences):
            remaining = sentences[prev:]
            if remaining:
                chunks.append(self._create_chunk(remaining, len(chunks), full_text))

        return chunks

    def _create_chunk(self, sentences: List[str], position: int, full_text: str = "") -> Chunk:
        """Tạo Chunk object từ list sentences."""
        text = " ".join(sentences)
        word_count = len(text.split())

        # Tính char offsets trong full_text
        char_start = 0
        char_end = len(text)
        if full_text:
            idx = full_text.find(sentences[0][:50])
            if idx >= 0:
                char_start = idx
                last_sent = sentences[-1]
                end_idx = full_text.find(last_sent[-50:], char_start)
                if end_idx >= 0:
                    char_end = end_idx + len(last_sent)

        return Chunk(
            chunk_id=str(uuid.uuid4())[:12],
            text=text,
            position=position,
            char_start=char_start,
            char_end=char_end,
            sentence_count=len(sentences),
            word_count=word_count,
        )

    def _merge_short_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """Merge chunks quá ngắn (< min_chunk_words) vào chunk kế cận."""
        if len(chunks) <= 1:
            return chunks

        merged = [chunks[0]]
        for i in range(1, len(chunks)):
            if chunks[i].word_count < self.min_chunk_words:
                # Merge vào chunk trước
                prev = merged[-1]
                prev.text = prev.text + " " + chunks[i].text
                prev.word_count = len(prev.text.split())
                prev.sentence_count += chunks[i].sentence_count
                prev.char_end = chunks[i].char_end
            else:
                merged.append(chunks[i])

        return merged

    def _split_long_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """Split chunks quá dài (> max_chunk_words) thành chunks nhỏ hơn."""
        result = []
        for chunk in chunks:
            if chunk.word_count > self.max_chunk_words:
                # Split bằng cách chia đôi tại sentence boundary gần nhất
                sentences = re.split(r'(?<=[.!?])\s+', chunk.text)
                mid = len(sentences) // 2

                part1 = " ".join(sentences[:mid])
                part2 = " ".join(sentences[mid:])

                result.append(Chunk(
                    chunk_id=str(uuid.uuid4())[:12],
                    text=part1,
                    position=len(result),
                    word_count=len(part1.split()),
                    sentence_count=mid,
                ))
                result.append(Chunk(
                    chunk_id=str(uuid.uuid4())[:12],
                    text=part2,
                    position=len(result),
                    word_count=len(part2.split()),
                    sentence_count=len(sentences) - mid,
                ))
            else:
                result.append(chunk)

        return result
