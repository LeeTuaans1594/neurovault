"""
NEUROVAULT — Language Detector Module
Detect ngôn ngữ (Vietnamese / English / Mixed) bằng character trigram fingerprinting.
100% tự viết, không dùng langdetect hay bất kỳ library nào.
"""

import re
import math
from collections import Counter
from typing import Dict, Tuple


class LanguageDetector:
    """
    Language Detection bằng Character Trigram Frequency Fingerprinting.

    Thuật toán:
    1. Tính character trigram frequency profile cho input text
    2. So sánh (cosine similarity) với pre-computed reference profiles
    3. Language = profile có similarity cao nhất
    4. Nếu cả 2 > threshold → "mixed"
    """

    def __init__(self):
        # Pre-computed reference profiles
        # Được tính từ đặc trưng ngôn ngữ (top 300 trigrams)
        self._vi_profile = self._build_vietnamese_profile()
        self._en_profile = self._build_english_profile()

    def detect(self, text: str) -> str:
        """
        Detect language of text.
        Returns: 'vi', 'en', 'mixed', hoặc 'unknown'
        """
        if not text or len(text.strip()) < 20:
            return 'unknown'

        # Compute trigram profile cho input
        text_profile = self._compute_trigram_profile(text.lower())

        if not text_profile:
            return 'unknown'

        # Score against each language
        vi_score = self._cosine_similarity(text_profile, self._vi_profile)
        en_score = self._cosine_similarity(text_profile, self._en_profile)

        # Heuristic bổ sung: Vietnamese diacritical marks
        vi_char_ratio = self._vietnamese_char_ratio(text)

        # Adjust scores
        vi_score_adjusted = vi_score + vi_char_ratio * 0.3
        en_score_adjusted = en_score + (1 - vi_char_ratio) * 0.1

        # Decision logic
        if vi_char_ratio > 0.15:
            # Có nhiều dấu tiếng Việt → chắc chắn có Vietnamese
            if en_score > 0.3 and vi_char_ratio < 0.3:
                return 'mixed'
            return 'vi'

        if vi_score_adjusted > en_score_adjusted and vi_score_adjusted > 0.2:
            if en_score > 0.3:
                return 'mixed'
            return 'vi'
        elif en_score_adjusted > 0.15:
            return 'en'
        else:
            return 'unknown'

    def detect_with_confidence(self, text: str) -> Tuple[str, float]:
        """Detect language kèm confidence score."""
        lang = self.detect(text)
        text_profile = self._compute_trigram_profile(text.lower())

        if lang == 'vi':
            conf = self._cosine_similarity(text_profile, self._vi_profile)
        elif lang == 'en':
            conf = self._cosine_similarity(text_profile, self._en_profile)
        elif lang == 'mixed':
            vi_s = self._cosine_similarity(text_profile, self._vi_profile)
            en_s = self._cosine_similarity(text_profile, self._en_profile)
            conf = (vi_s + en_s) / 2
        else:
            conf = 0.0

        return lang, min(1.0, conf)

    def _compute_trigram_profile(self, text: str) -> Dict[str, float]:
        """Tính character trigram frequency profile."""
        # Chỉ giữ letters và spaces
        cleaned = re.sub(r'[^a-zA-ZÀ-ỹ\s]', '', text)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()

        if len(cleaned) < 3:
            return {}

        # Đếm trigrams
        trigrams = Counter()
        for i in range(len(cleaned) - 2):
            trigram = cleaned[i:i + 3]
            trigrams[trigram] += 1

        # Normalize thành frequency
        total = sum(trigrams.values())
        if total == 0:
            return {}

        profile = {k: v / total for k, v in trigrams.most_common(300)}
        return profile

    def _cosine_similarity(self, profile_a: Dict[str, float], profile_b: Dict[str, float]) -> float:
        """Cosine similarity giữa 2 trigram profiles."""
        if not profile_a or not profile_b:
            return 0.0

        # Intersection of keys
        common_keys = set(profile_a.keys()) & set(profile_b.keys())

        if not common_keys:
            return 0.0

        dot_product = sum(profile_a[k] * profile_b[k] for k in common_keys)
        norm_a = math.sqrt(sum(v ** 2 for v in profile_a.values()))
        norm_b = math.sqrt(sum(v ** 2 for v in profile_b.values()))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot_product / (norm_a * norm_b)

    def _vietnamese_char_ratio(self, text: str) -> float:
        """Tính tỷ lệ ký tự có dấu tiếng Việt trong text."""
        if not text:
            return 0.0

        # Vietnamese-specific diacritical characters
        vi_chars = set('àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ'
                       'ÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ')

        letter_chars = [c for c in text if c.isalpha()]
        if not letter_chars:
            return 0.0

        vi_count = sum(1 for c in letter_chars if c in vi_chars)
        return vi_count / len(letter_chars)

    def _build_vietnamese_profile(self) -> Dict[str, float]:
        """
        Pre-computed top trigrams cho tiếng Việt.
        Tính từ đặc trưng phân phối trigram của corpus tiếng Việt.
        """
        # Top trigrams đặc trưng cho tiếng Việt (frequency-based)
        vi_trigrams = {
            'ng ': 0.035, ' ng': 0.030, 'ong': 0.025, 'nh ': 0.024, ' nh': 0.023,
            'anh': 0.020, ' tr': 0.020, 'tro': 0.018, 'ron': 0.017, ' ch': 0.017,
            'cho': 0.016, ' th': 0.022, 'the': 0.015, 'ung': 0.015, 'ang': 0.015,
            'ing': 0.014, ' la': 0.014, 'la ': 0.013, ' co': 0.013, 'con': 0.012,
            'ong': 0.012, ' ca': 0.012, 'cac': 0.011, 'ach': 0.011, ' va': 0.011,
            'va ': 0.010, 'hay': 0.010, ' ha': 0.010, 'chi': 0.010, 'hie': 0.009,
            'ien': 0.009, ' cu': 0.009, 'cua': 0.009, 'ua ': 0.009, ' gi': 0.009,
            'gia': 0.008, 'ong': 0.008, ' kh': 0.008, 'kho': 0.008, 'hon': 0.008,
            ' mo': 0.008, 'mot': 0.008, 'ot ': 0.008, ' ph': 0.012, 'pha': 0.007,
            'ngu': 0.007, ' ba': 0.007, 'ban': 0.007, ' bi': 0.007, 'bie': 0.007,
            'uoc': 0.006, ' du': 0.006, 'duo': 0.006, 'uoi': 0.006, ' di': 0.006,
            'voi': 0.006, ' vo': 0.006, ' da': 0.006, 'dan': 0.006, 'oi ': 0.006,
        }
        return vi_trigrams

    def _build_english_profile(self) -> Dict[str, float]:
        """
        Pre-computed top trigrams cho tiếng Anh.
        """
        en_trigrams = {
            'the': 0.035, 'he ': 0.030, ' th': 0.028, 'nd ': 0.020, 'and': 0.020,
            ' an': 0.018, 'ion': 0.017, 'tio': 0.016, 'ati': 0.015, ' in': 0.015,
            'ing': 0.015, 'ng ': 0.014, 'ent': 0.013, ' to': 0.013, 'to ': 0.012,
            ' of': 0.016, 'of ': 0.015, 'is ': 0.012, ' is': 0.012, 'for': 0.011,
            ' fo': 0.011, 'or ': 0.011, 'hat': 0.010, 'tha': 0.010, 'her': 0.010,
            ' he': 0.010, 'ere': 0.010, ' re': 0.009, 'ter': 0.009, 'his': 0.009,
            ' hi': 0.009, 'in ': 0.009, 'est': 0.009, ' co': 0.009, 'on ': 0.009,
            'con': 0.008, 'ed ': 0.008, 'ted': 0.008, 'ons': 0.008, ' st': 0.008,
            'ste': 0.007, ' wh': 0.007, 'whi': 0.007, 'ich': 0.007, 'all': 0.007,
            ' al': 0.007, 'ith': 0.007, 'wit': 0.007, ' wi': 0.007, 'res': 0.007,
            'are': 0.006, ' ar': 0.006, 're ': 0.006, ' be': 0.006, 'als': 0.006,
            ' ha': 0.006, 'has': 0.006, 'as ': 0.006, 'hin': 0.006, 'men': 0.006,
        }
        return en_trigrams
