"""
NEUROVAULT — Text Cleaner Module
Làm sạch text sau khi parse: Unicode normalization, whitespace, entities.
100% tự viết, không thư viện NLP bên ngoài.
"""

import unicodedata
import re
import html as html_module


class TextCleaner:
    """
    Text Cleaner pipeline:
    1. Unicode Normalization (NFC)
    2. HTML Entity Decode
    3. Hyphenation Fix (cross-line word breaks)
    4. Control Character Removal
    5. Whitespace Collapse
    6. Punctuation Normalization
    """

    # Patterns compiled 1 lần cho performance
    _CONTROL_CHARS = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]')
    _MULTIPLE_SPACES = re.compile(r'[ \t]+')
    _MULTIPLE_NEWLINES = re.compile(r'\n{3,}')
    _HYPHENATION = re.compile(r'(\w+)-\s*\n\s*(\w+)')
    _BULLET_NORMALIZE = re.compile(r'^[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25CF]\s*', re.MULTILINE)
    _SMART_QUOTES = {
        '\u2018': "'", '\u2019': "'",  # Smart single quotes
        '\u201C': '"', '\u201D': '"',  # Smart double quotes
        '\u2013': '-', '\u2014': '-',  # En dash, Em dash
        '\u2026': '...',               # Ellipsis
        '\u00A0': ' ',                 # Non-breaking space
    }

    def clean(self, text: str) -> str:
        """
        Main cleaning pipeline.
        Trả về text sạch, sẵn sàng cho NLP processing.
        """
        if not text or not isinstance(text, str):
            return ""

        # Step 1: Unicode NFC normalization
        # Đảm bảo "ủ" là 1 codepoint, không phải "u" + combining mark
        text = unicodedata.normalize('NFC', text)

        # Step 2: HTML entity decode
        text = html_module.unescape(text)

        # Step 3: Smart quotes → ASCII equivalents
        for smart, ascii_char in self._SMART_QUOTES.items():
            text = text.replace(smart, ascii_char)

        # Step 4: Fix hyphenation (word broken across lines)
        # "knowl-\nedge" → "knowledge"
        text = self._HYPHENATION.sub(r'\1\2', text)

        # Step 5: Remove control characters (nhưng giữ \n, \t, \r)
        text = self._CONTROL_CHARS.sub('', text)

        # Step 6: Normalize bullet points
        text = self._BULLET_NORMALIZE.sub('• ', text)

        # Step 7: Collapse whitespace
        # Multiple spaces/tabs → single space
        text = self._MULTIPLE_SPACES.sub(' ', text)
        # Multiple newlines → double newline (paragraph break)
        text = self._MULTIPLE_NEWLINES.sub('\n\n', text)

        # Step 8: Strip leading/trailing whitespace per line
        lines = text.split('\n')
        lines = [line.strip() for line in lines]
        text = '\n'.join(lines)

        # Step 9: Final trim
        text = text.strip()

        return text

    def clean_for_embedding(self, text: str) -> str:
        """
        Cleaning tối giản cho embedding — lowercase, remove punctuation extra.
        """
        text = self.clean(text)
        # Remove URLs
        text = re.sub(r'https?://\S+', '', text)
        # Remove email addresses
        text = re.sub(r'\S+@\S+\.\S+', '', text)
        # Normalize whitespace again
        text = self._MULTIPLE_SPACES.sub(' ', text).strip()
        return text

    def extract_plain_text(self, text: str) -> str:
        """
        Remove tất cả formatting, chỉ giữ plain text.
        Hữu ích cho word count, statistics.
        """
        text = self.clean(text)
        # Remove markdown formatting
        text = re.sub(r'[#*_~`]', '', text)
        # Remove remaining special chars nhưng giữ tiếng Việt
        text = re.sub(r'[^\w\s\u00C0-\u024F\u1E00-\u1EFF.,!?;:\-\'\"()]', ' ', text)
        text = self._MULTIPLE_SPACES.sub(' ', text).strip()
        return text

    @staticmethod
    def count_words(text: str) -> int:
        """Đếm số từ (hoạt động cho cả tiếng Anh và tiếng Việt)."""
        if not text:
            return 0
        return len(text.split())

    @staticmethod
    def count_sentences(text: str) -> int:
        """Ước tính nhanh số câu (dựa trên sentence-ending punctuation)."""
        if not text:
            return 0
        return len(re.findall(r'[.!?]+', text))
