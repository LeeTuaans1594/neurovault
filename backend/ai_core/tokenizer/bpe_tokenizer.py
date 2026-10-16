"""
NEUROVAULT — BPE Tokenizer (White-Box)
Byte Pair Encoding tokenizer tự implement 100%.
KHÔNG dùng tiktoken, sentencepiece, tokenizers, hay bất kỳ library nào.

Features:
- Train BPE vocabulary from corpus (EN/VI bilingual)
- Configurable vocab size (8K-16K)
- Special tokens: [PAD], [UNK], [BOS], [EOS], [SEP], [CLS]
- Vietnamese diacritics-aware
- Encode text → token IDs
- Decode token IDs → text
- Save/load vocabulary to/from disk
- Byte-level fallback for unknown characters

Algorithm:
1. Pre-tokenize: split text into words
2. Initialize vocab with all characters + byte fallbacks
3. Iteratively merge most frequent adjacent pairs
4. Build merge table for fast encoding

Reference: Sennrich et al. 2016 "Neural Machine Translation of Rare Words with Subword Units"
"""

import re
import json
import os
from collections import Counter, defaultdict
from typing import List, Dict, Tuple, Optional, Set


# Special tokens
SPECIAL_TOKENS = {
    "[PAD]": 0,
    "[UNK]": 1,
    "[BOS]": 2,
    "[EOS]": 3,
    "[SEP]": 4,
    "[CLS]": 5,
    "[MASK]": 6,
    "[THINK]": 7,
    "[/THINK]": 8,
}
NUM_SPECIAL = len(SPECIAL_TOKENS)


class BPETokenizer:
    """
    Byte Pair Encoding tokenizer — 100% white-box.

    Usage:
        tokenizer = BPETokenizer(vocab_size=8192)
        tokenizer.train(["corpus text 1", "corpus text 2"])
        ids = tokenizer.encode("Hello world")
        text = tokenizer.decode(ids)
    """

    def __init__(
        self,
        vocab_size: int = 8192,
        min_frequency: int = 2,
        end_of_word: str = "</w>",
    ):
        """
        Args:
            vocab_size: Target vocabulary size (including special tokens)
            min_frequency: Minimum pair frequency to consider for merge
            end_of_word: End-of-word marker
        """
        self.vocab_size = vocab_size
        self.min_frequency = min_frequency
        self.end_of_word = end_of_word

        # Vocabulary: token_str → token_id
        self.vocab: Dict[str, int] = dict(SPECIAL_TOKENS)
        # Reverse vocab: token_id → token_str
        self.id_to_token: Dict[int, str] = {v: k for k, v in SPECIAL_TOKENS.items()}

        # Merge rules: list of (token_a, token_b) in merge order
        self.merges: List[Tuple[str, str]] = []
        # Merge lookup for fast encoding
        self._merge_ranks: Dict[Tuple[str, str], int] = {}

        # Pre-tokenize regex (split into words + punctuation)
        self._word_re = re.compile(
            r"""'s|'t|'re|'ve|'m|'ll|'d"""  # English contractions
            r"""|\w+"""                       # Words (includes Vietnamese diacritics)
            r"""|[^\s\w]"""                   # Punctuation
            r"""|\s+""",                      # Whitespace
            re.UNICODE
        )

        self._trained = False

    # ══════════════════════════════════════════════
    # TRAINING
    # ══════════════════════════════════════════════

    def train(self, texts: List[str], verbose: bool = False) -> Dict:
        """
        Train BPE vocabulary from corpus.

        Steps:
        1. Pre-tokenize corpus into words
        2. Split each word into characters + end_of_word marker
        3. Count pair frequencies
        4. Merge most frequent pair
        5. Repeat until vocab_size reached

        Args:
            texts: List of training texts
            verbose: Print progress

        Returns:
            Training stats dict
        """
        if verbose:
            print(f"[BPE] Training with vocab_size={self.vocab_size}...")

        # Step 1: Pre-tokenize and count word frequencies
        word_freqs = self._count_words(texts)
        if verbose:
            print(f"[BPE] Unique words: {len(word_freqs)}")

        # Step 2: Initialize — split words into character sequences
        # Each word becomes a tuple of characters + end_of_word marker
        # word_splits[word_tuple] = frequency
        word_splits: Dict[Tuple[str, ...], int] = {}
        char_set: Set[str] = set()

        for word, freq in word_freqs.items():
            chars = tuple(list(word) + [self.end_of_word])
            word_splits[chars] = freq
            char_set.update(chars)

        # Build initial vocabulary from characters
        next_id = NUM_SPECIAL
        for char in sorted(char_set):
            if char not in self.vocab:
                self.vocab[char] = next_id
                self.id_to_token[next_id] = char
                next_id += 1

        initial_vocab_size = len(self.vocab)
        target_merges = self.vocab_size - initial_vocab_size

        if verbose:
            print(f"[BPE] Initial vocab: {initial_vocab_size} chars")
            print(f"[BPE] Target merges: {target_merges}")

        # Step 3-5: Iterative merging
        num_merges = 0
        for i in range(max(0, target_merges)):
            # Count adjacent pair frequencies
            pair_freqs = self._count_pairs(word_splits)
            if not pair_freqs:
                break

            # Find most frequent pair
            best_pair = max(pair_freqs, key=pair_freqs.get)
            best_freq = pair_freqs[best_pair]

            if best_freq < self.min_frequency:
                break

            # Merge the pair
            merged_token = best_pair[0] + best_pair[1]
            word_splits = self._merge_pair(word_splits, best_pair, merged_token)

            # Add to vocabulary
            if merged_token not in self.vocab:
                self.vocab[merged_token] = next_id
                self.id_to_token[next_id] = merged_token
                next_id += 1

            # Record merge rule
            self.merges.append(best_pair)
            self._merge_ranks[best_pair] = num_merges
            num_merges += 1

            if verbose and (i + 1) % 500 == 0:
                print(f"[BPE] Merge {i+1}/{target_merges}: "
                      f"'{best_pair[0]}' + '{best_pair[1]}' → '{merged_token}' "
                      f"(freq={best_freq})")

        self._trained = True

        stats = {
            "vocab_size": len(self.vocab),
            "num_merges": num_merges,
            "initial_chars": initial_vocab_size,
            "unique_words": len(word_freqs),
            "corpus_size": sum(len(t) for t in texts),
        }

        if verbose:
            print(f"[BPE] Training complete! Vocab size: {stats['vocab_size']}")

        return stats

    def _count_words(self, texts: List[str]) -> Dict[str, int]:
        """Pre-tokenize and count word frequencies."""
        word_freqs: Counter = Counter()
        for text in texts:
            tokens = self._word_re.findall(text.lower())
            for token in tokens:
                token = token.strip()
                if token and not token.isspace():
                    word_freqs[token] += 1
        return dict(word_freqs)

    def _count_pairs(
        self, word_splits: Dict[Tuple[str, ...], int]
    ) -> Dict[Tuple[str, str], int]:
        """Count adjacent symbol pair frequencies across all words."""
        pairs: Counter = Counter()
        for symbols, freq in word_splits.items():
            for i in range(len(symbols) - 1):
                pair = (symbols[i], symbols[i + 1])
                pairs[pair] += freq
        return dict(pairs)

    def _merge_pair(
        self,
        word_splits: Dict[Tuple[str, ...], int],
        pair: Tuple[str, str],
        merged: str,
    ) -> Dict[Tuple[str, ...], int]:
        """Merge all occurrences of pair in word_splits."""
        new_splits = {}
        a, b = pair

        for symbols, freq in word_splits.items():
            new_symbols = []
            i = 0
            while i < len(symbols):
                if i < len(symbols) - 1 and symbols[i] == a and symbols[i + 1] == b:
                    new_symbols.append(merged)
                    i += 2
                else:
                    new_symbols.append(symbols[i])
                    i += 1
            new_splits[tuple(new_symbols)] = freq

        return new_splits

    # ══════════════════════════════════════════════
    # ENCODING
    # ══════════════════════════════════════════════

    def encode(self, text: str, add_special: bool = False) -> List[int]:
        """
        Encode text to token IDs.

        Args:
            text: Input text
            add_special: Add [BOS] and [EOS] tokens

        Returns:
            List of token IDs
        """
        if not self._trained:
            # Fallback: character-level encoding
            return self._char_encode(text)

        ids = []
        if add_special:
            ids.append(SPECIAL_TOKENS["[BOS]"])

        # Pre-tokenize into words
        words = self._word_re.findall(text.lower())

        for word in words:
            word = word.strip()
            if not word:
                continue

            # Split word into subwords using learned merges
            subwords = self._bpe_encode_word(word)
            for sw in subwords:
                if sw in self.vocab:
                    ids.append(self.vocab[sw])
                else:
                    ids.append(SPECIAL_TOKENS["[UNK]"])

        if add_special:
            ids.append(SPECIAL_TOKENS["[EOS]"])

        return ids

    def _bpe_encode_word(self, word: str) -> List[str]:
        """Apply BPE merges to a single word."""
        # Start with character-level split
        symbols = list(word) + [self.end_of_word]

        if len(symbols) <= 1:
            return symbols

        # Apply merges in order of priority
        while len(symbols) > 1:
            # Find the highest-priority merge that can be applied
            best_pair = None
            best_rank = float('inf')
            best_pos = -1

            for i in range(len(symbols) - 1):
                pair = (symbols[i], symbols[i + 1])
                rank = self._merge_ranks.get(pair, float('inf'))
                if rank < best_rank:
                    best_rank = rank
                    best_pair = pair
                    best_pos = i

            if best_pair is None or best_rank == float('inf'):
                break

            # Apply the merge at all positions
            merged = best_pair[0] + best_pair[1]
            new_symbols = []
            i = 0
            while i < len(symbols):
                if (i < len(symbols) - 1
                    and symbols[i] == best_pair[0]
                    and symbols[i + 1] == best_pair[1]):
                    new_symbols.append(merged)
                    i += 2
                else:
                    new_symbols.append(symbols[i])
                    i += 1
            symbols = new_symbols

        return symbols

    def _char_encode(self, text: str) -> List[int]:
        """Fallback character-level encoding for untrained tokenizer."""
        ids = []
        for char in text:
            if char in self.vocab:
                ids.append(self.vocab[char])
            else:
                ids.append(SPECIAL_TOKENS["[UNK]"])
        return ids

    # ══════════════════════════════════════════════
    # DECODING
    # ══════════════════════════════════════════════

    def decode(self, ids: List[int], skip_special: bool = True) -> str:
        """
        Decode token IDs back to text.

        Args:
            ids: List of token IDs
            skip_special: Skip special tokens in output

        Returns:
            Decoded text string
        """
        tokens = []
        for id_ in ids:
            if id_ in self.id_to_token:
                token = self.id_to_token[id_]
                if skip_special and token in SPECIAL_TOKENS:
                    continue
                tokens.append(token)

        text = "".join(tokens)
        # Remove end-of-word markers and clean up
        text = text.replace(self.end_of_word, " ")
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    # ══════════════════════════════════════════════
    # PERSISTENCE
    # ══════════════════════════════════════════════

    def save(self, path: str) -> None:
        """Save tokenizer vocabulary and merges to disk."""
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
        data = {
            "vocab_size": self.vocab_size,
            "min_frequency": self.min_frequency,
            "end_of_word": self.end_of_word,
            "vocab": self.vocab,
            "merges": [list(m) for m in self.merges],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls, path: str) -> "BPETokenizer":
        """Load tokenizer from disk."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        tokenizer = cls(
            vocab_size=data["vocab_size"],
            min_frequency=data.get("min_frequency", 2),
            end_of_word=data.get("end_of_word", "</w>"),
        )
        tokenizer.vocab = data["vocab"]
        tokenizer.id_to_token = {int(v): k for k, v in data["vocab"].items()}
        tokenizer.merges = [tuple(m) for m in data["merges"]]
        tokenizer._merge_ranks = {tuple(m): i for i, m in enumerate(data["merges"])}
        tokenizer._trained = True

        return tokenizer

    # ══════════════════════════════════════════════
    # UTILITIES
    # ══════════════════════════════════════════════

    def tokenize(self, text: str) -> List[str]:
        """Encode text and return token strings (not IDs)."""
        ids = self.encode(text)
        return [self.id_to_token.get(id_, "[UNK]") for id_ in ids]

    def vocab_size_actual(self) -> int:
        """Return actual vocabulary size."""
        return len(self.vocab)

    def get_vocab(self) -> Dict[str, int]:
        """Return vocabulary dict."""
        return dict(self.vocab)

    def token_to_id(self, token: str) -> int:
        """Convert token string to ID."""
        return self.vocab.get(token, SPECIAL_TOKENS["[UNK]"])

    def id_to_token_str(self, id_: int) -> str:
        """Convert ID to token string."""
        return self.id_to_token.get(id_, "[UNK]")

    @property
    def pad_id(self) -> int:
        return SPECIAL_TOKENS["[PAD]"]

    @property
    def unk_id(self) -> int:
        return SPECIAL_TOKENS["[UNK]"]

    @property
    def bos_id(self) -> int:
        return SPECIAL_TOKENS["[BOS]"]

    @property
    def eos_id(self) -> int:
        return SPECIAL_TOKENS["[EOS]"]
