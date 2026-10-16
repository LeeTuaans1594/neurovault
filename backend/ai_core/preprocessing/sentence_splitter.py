"""
NEUROVAULT — Sentence Splitter Module
Tách text thành câu riêng lẻ.
Hybrid: Rule-based + abbreviation-aware + Vietnamese-aware.
100% tự viết.
"""

import re
from typing import List


class SentenceSplitter:
    """
    Sentence Splitter hỗ trợ tiếng Anh + tiếng Việt.

    Nguyên lý:
    1. Protect abbreviations (Dr., Mr., e.g., v.v.)
    2. Protect numbers (3.14, 1.000.000)
    3. Split tại sentence boundaries (. ? !)
    4. Handle list items (1., a), -)
    5. Post-process: merge fragments quá ngắn
    """

    # Abbreviations phổ biến (English + Vietnamese)
    ABBREVIATIONS = {
        # English
        'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'etc', 'inc', 'ltd',
        'co', 'corp', 'dept', 'univ', 'assn', 'bros', 'rep', 'sen', 'gov',
        'gen', 'sgt', 'cpl', 'pvt', 'capt', 'lt', 'col', 'maj', 'cmdr',
        'adm', 'rev', 'hon', 'pres', 'govt',
        'jan', 'feb', 'mar', 'apr', 'may', 'jun',
        'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
        'fig', 'eq', 'ref', 'vol', 'no', 'op',
        'al',  # et al.
        # Latin
        'e.g', 'i.e', 'cf', 'viz', 'approx',
        # Vietnamese
        'ts', 'ths', 'pgs', 'gs', 'ks', 'cn', 'ths',
        'tp', 'tx', 'tt', 'xã',
    }

    # Pattern cho list items
    _LIST_PATTERN = re.compile(r'^\s*(?:\d+[.)]\s|[a-zA-Z][.)]\s|[-•*]\s)')

    # Pattern cho sentence endings
    _SENT_END = re.compile(r'([.!?]+)\s+')

    # Pattern cho abbreviation protection
    _ABBREV_DOT = re.compile(r'\b([A-Za-z]{1,5})\.\s')

    # Number pattern (e.g., 3.14, 1.000)
    _NUMBER_DOT = re.compile(r'(\d+)\.(\d+)')

    # Placeholder markers
    _NUM_PLACEHOLDER = "§NUM§"
    _ABBR_PLACEHOLDER = "§ABBR§"

    def split(self, text: str) -> List[str]:
        """Tách text thành danh sách câu."""
        if not text or not text.strip():
            return []

        # Step 1: Protect numbers with dots (3.14 → 3§NUM§14)
        protected = self._protect_numbers(text)

        # Step 2: Protect abbreviations (Dr. → Dr§ABBR§)
        protected = self._protect_abbreviations(protected)

        # Step 3: Split at sentence boundaries
        raw_sentences = self._split_at_boundaries(protected)

        # Step 4: Restore placeholders
        sentences = [self._restore_placeholders(s) for s in raw_sentences]

        # Step 5: Clean and filter
        sentences = [s.strip() for s in sentences if s.strip()]

        # Step 6: Merge fragments quá ngắn (< 10 chars) vào câu trước
        sentences = self._merge_short_fragments(sentences, min_length=10)

        return sentences

    def _protect_numbers(self, text: str) -> str:
        """Bảo vệ số thập phân: 3.14 → 3§NUM§14"""
        return self._NUMBER_DOT.sub(rf'\1{self._NUM_PLACEHOLDER}\2', text)

    def _protect_abbreviations(self, text: str) -> str:
        """Bảo vệ abbreviations: Dr. Smith → Dr§ABBR§ Smith"""
        def replace_if_abbr(match):
            word = match.group(1).lower()
            if word in self.ABBREVIATIONS:
                return f"{match.group(1)}{self._ABBR_PLACEHOLDER} "
            return match.group(0)

        return self._ABBREV_DOT.sub(replace_if_abbr, text)

    def _split_at_boundaries(self, text: str) -> List[str]:
        """Split tại sentence boundaries (. ? !)"""
        # Split nhưng giữ lại delimiter
        parts = self._SENT_END.split(text)

        sentences = []
        i = 0
        while i < len(parts):
            if i + 1 < len(parts) and re.match(r'^[.!?]+$', parts[i + 1]):
                # Ghép text + punctuation
                sentences.append(parts[i] + parts[i + 1])
                i += 2
            else:
                sentences.append(parts[i])
                i += 1

        return sentences

    def _restore_placeholders(self, text: str) -> str:
        """Khôi phục number và abbreviation placeholders."""
        text = text.replace(self._NUM_PLACEHOLDER, ".")
        text = text.replace(self._ABBR_PLACEHOLDER, ".")
        return text

    def _merge_short_fragments(self, sentences: List[str], min_length: int = 10) -> List[str]:
        """Merge fragments quá ngắn vào câu trước đó."""
        if not sentences:
            return sentences

        merged = [sentences[0]]
        for i in range(1, len(sentences)):
            if len(sentences[i]) < min_length and merged:
                merged[-1] = merged[-1] + " " + sentences[i]
            else:
                merged.append(sentences[i])

        return merged

    def split_into_paragraphs(self, text: str) -> List[str]:
        """Tách text thành paragraphs (dựa trên double newline)."""
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]
