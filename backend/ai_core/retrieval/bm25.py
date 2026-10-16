"""
NEUROVAULT — BM25 Retrieval Engine (White-Box)
Okapi BM25 scoring algorithm tự implement 100%.
Không dùng rank_bm25, elasticsearch, hay bất kỳ library nào.
"""

import math
import re
from collections import Counter
from typing import List, Dict, Tuple


class BM25:
    """
    Okapi BM25 ranking algorithm.
    
    Formula: score(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
    
    Parameters:
        k1: Term frequency saturation parameter (1.2-2.0)
        b: Document length normalization (0.75 standard)
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = 0
        self.avgdl = 0.0
        self.doc_freqs: Dict[str, int] = {}  # word → number of docs containing it
        self.doc_lens: List[int] = []
        self.tf_cache: List[Dict[str, int]] = []  # per-doc term frequencies
        self.idf_cache: Dict[str, float] = {}
        self._indexed = False

        # Vietnamese + English stopwords
        self._stopwords = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'shall', 'of', 'in', 'to', 'for',
            'with', 'on', 'at', 'from', 'by', 'and', 'or', 'but', 'not', 'no',
            'if', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you',
            'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their',
            'là', 'và', 'của', 'có', 'trong', 'được', 'cho', 'này', 'với',
            'các', 'không', 'một', 'những', 'đã', 'để', 'từ', 'theo', 'về',
            'như', 'khi', 'người', 'cũng', 'tại', 'thì', 'hay', 'hoặc',
        }

    def tokenize(self, text: str) -> List[str]:
        """Tokenize: lowercase, remove punctuation, filter stopwords."""
        text = text.lower()
        text = re.sub(r'[^\w\s\u00C0-\u024F\u1E00-\u1EFF]', ' ', text)
        words = text.split()
        return [w for w in words if w not in self._stopwords and len(w) > 1]

    def index(self, documents: List[str]) -> None:
        """Build BM25 index from corpus of documents."""
        self.corpus_size = len(documents)
        self.doc_freqs = {}
        self.doc_lens = []
        self.tf_cache = []

        for doc in documents:
            tokens = self.tokenize(doc)
            self.doc_lens.append(len(tokens))

            tf = Counter(tokens)
            self.tf_cache.append(dict(tf))

            # Count document frequency (each word counted once per doc)
            for word in set(tokens):
                self.doc_freqs[word] = self.doc_freqs.get(word, 0) + 1

        self.avgdl = sum(self.doc_lens) / max(self.corpus_size, 1)
        self._compute_idf()
        self._indexed = True

    def _compute_idf(self) -> None:
        """Compute IDF for all terms: log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)"""
        self.idf_cache = {}
        for word, df in self.doc_freqs.items():
            idf = math.log((self.corpus_size - df + 0.5) / (df + 0.5) + 1.0)
            self.idf_cache[word] = idf

    def score(self, query: str, doc_idx: int) -> float:
        """Compute BM25 score for a single document against query."""
        if not self._indexed:
            return 0.0

        query_tokens = self.tokenize(query)
        doc_tf = self.tf_cache[doc_idx]
        doc_len = self.doc_lens[doc_idx]

        score = 0.0
        for qt in query_tokens:
            if qt not in self.idf_cache:
                continue
            idf = self.idf_cache[qt]
            tf = doc_tf.get(qt, 0)
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / max(self.avgdl, 1))
            score += idf * (numerator / denominator)

        return score

    def search(self, query: str, top_k: int = 10) -> List[Tuple[int, float]]:
        """Search corpus, return top-k (doc_index, score) sorted by score desc."""
        if not self._indexed:
            return []

        scores = []
        for i in range(self.corpus_size):
            s = self.score(query, i)
            if s > 0:
                scores.append((i, s))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

    def get_stats(self) -> Dict:
        return {
            "corpus_size": self.corpus_size,
            "vocabulary_size": len(self.doc_freqs),
            "avg_doc_length": round(self.avgdl, 1),
            "k1": self.k1,
            "b": self.b,
        }
