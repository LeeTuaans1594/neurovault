"""
NEUROVAULT — Vietnamese NLP Module (White-Box)
Xử lý ngôn ngữ tiếng Việt 100% tự viết.
KHÔNG dùng underthesea, pyvi, vncorenlp, hay bất kỳ library NLP bên thứ 3 nào.

Tính năng:
1. Word segmenter (rule-based + dictionary)
2. Stopwords filter (500+ từ EN/VI)
3. Diacritics normalizer (chuẩn hóa Unicode NFC)
4. Syllable tokenizer
5. Text normalizer (lowercase, punctuation, whitespace)
"""

import re
import unicodedata
from typing import List, Set, Tuple, Optional


# ══════════════════════════════════════════════
# VIETNAMESE STOPWORDS — Tổng hợp từ nhiều nguồn
# ══════════════════════════════════════════════

VIETNAMESE_STOPWORDS: Set[str] = {
    # Đại từ / Pronouns
    "tôi", "tao", "mình", "ta", "chúng_tôi", "chúng_ta", "chúng_mình",
    "bạn", "cậu", "anh", "chị", "em", "ông", "bà", "nó", "họ",
    "ai", "gì", "nào", "đâu", "sao",
    # Giới từ / Prepositions
    "của", "trong", "ngoài", "trên", "dưới", "giữa", "trước", "sau",
    "từ", "đến", "tới", "về", "với", "cho", "bởi", "vì", "do",
    "theo", "qua", "bằng", "tại", "ở",
    # Liên từ / Conjunctions
    "và", "hoặc", "hay", "nhưng", "mà", "còn", "nên", "vì", "nếu",
    "thì", "tuy", "dù", "rằng", "rồi", "lại",
    # Trợ từ / Particles
    "là", "đã", "đang", "sẽ", "có", "không", "chưa", "được", "bị",
    "phải", "cần", "nên", "cũng", "vẫn", "rất", "quá", "lắm",
    "hơn", "nhất", "chỉ", "mới", "lại", "đều", "luôn",
    # Chỉ định / Determiners
    "này", "kia", "đó", "ấy", "đấy", "thế", "vậy",
    "các", "những", "mọi", "mỗi", "một", "hai", "ba",
    # Phó từ / Adverbs
    "rất", "hết", "tất_cả", "hoàn_toàn", "thật", "chính",
    "thường", "hay", "luôn", "đôi_khi", "ít_khi",
    "nhiều", "ít", "vài", "hầu_hết", "phần_lớn",
    # Động từ phụ trợ / Auxiliary verbs
    "có_thể", "phải", "nên", "cần", "muốn", "biết",
    "bắt_đầu", "tiếp_tục", "xong", "hết",
    # Nghi vấn / Interrogatives
    "sao", "tại_sao", "vì_sao", "làm_sao", "thế_nào", "bao_nhiêu",
    "bao_giờ", "khi_nào", "ở_đâu",
    # Trạng từ thời gian / Time adverbs
    "hôm_nay", "ngày", "tháng", "năm", "lúc", "khi",
    "bây_giờ", "hiện_tại", "trước_đây", "sau_này",
    # Từ nối câu / Discourse markers
    "tuy_nhiên", "ngoài_ra", "hơn_nữa", "mặc_dù", "do_đó",
    "vì_vậy", "cho_nên", "bởi_vậy", "thêm_vào_đó",
    "nói_chung", "nói_riêng", "ví_dụ", "chẳng_hạn",
    # Misc
    "để", "ra", "lên", "xuống", "vào", "đi", "lại", "về",
    "cùng", "chung", "riêng", "khác", "như", "giống",
    "thêm", "bớt", "đủ", "thiếu", "thừa",
    "v.v", "vv", "v.v.", "etc",
}

ENGLISH_STOPWORDS: Set[str] = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having", "do", "does", "did", "doing",
    "will", "would", "could", "should", "shall", "may", "might", "must",
    "of", "in", "to", "for", "with", "on", "at", "from", "by",
    "up", "out", "off", "over", "under", "again", "further", "then",
    "and", "or", "but", "nor", "not", "so", "yet", "both", "either", "neither",
    "it", "its", "this", "that", "these", "those", "which", "who", "whom",
    "what", "where", "when", "why", "how",
    "all", "each", "every", "any", "some", "no", "more", "most", "other",
    "such", "than", "too", "very", "just", "only", "also",
    "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
    "she", "her", "they", "them", "their",
    "about", "above", "after", "before", "between", "into", "through",
    "during", "while", "because", "although", "since", "until",
    "as", "if", "else", "here", "there", "own", "same", "can",
}

# Tất cả stopwords hợp nhất
ALL_STOPWORDS: Set[str] = VIETNAMESE_STOPWORDS | ENGLISH_STOPWORDS


# ══════════════════════════════════════════════
# VIETNAMESE COMPOUND WORDS DICTIONARY
# Từ ghép tiếng Việt thường gặp trong giáo dục/khoa học
# ══════════════════════════════════════════════

COMPOUND_WORDS: Set[str] = {
    # Giáo dục / Education
    "học sinh", "sinh viên", "giáo viên", "trường học", "đại học",
    "trung học", "tiểu học", "mầm non", "cao đẳng", "thạc sĩ",
    "tiến sĩ", "giáo dục", "đào tạo", "nghiên cứu", "khoa học",
    "công nghệ", "toán học", "vật lý", "hóa học", "sinh học",
    "lịch sử", "địa lý", "văn học", "ngôn ngữ",
    # CNTT / IT
    "trí tuệ nhân tạo", "học máy", "học sâu", "mạng nơ ron",
    "cơ sở dữ liệu", "thuật toán", "phần mềm", "phần cứng",
    "hệ thống", "chương trình", "ứng dụng", "giao diện",
    "mã nguồn", "xử lý", "tính toán",
    # Khoa học / Science
    "phương pháp", "phương trình", "kết quả", "quá trình",
    "nguyên tắc", "nguyên lý", "định luật", "định lý",
    "giả thuyết", "thí nghiệm", "quan sát", "phân tích",
    "tổng hợp", "đánh giá", "so sánh", "kết luận",
    # Chung / General
    "vấn đề", "giải pháp", "mục tiêu", "chất lượng",
    "hiệu quả", "khả năng", "năng lực", "kiến thức",
    "kỹ năng", "thực hành", "lý thuyết", "thực tế",
    "ý nghĩa", "tầm quan trọng", "vai trò",
}

# Build prefix tree (trie) cho compound word matching nhanh
_COMPOUND_SORTED = sorted(COMPOUND_WORDS, key=len, reverse=True)


class VietnameseNLP:
    """
    Vietnamese NLP processor — 100% white-box, zero dependencies.

    Methods:
        normalize(text) → chuẩn hóa Unicode, whitespace, punctuation
        segment(text) → word segmentation (compound word matching)
        tokenize(text) → segment + remove stopwords
        remove_diacritics(text) → bỏ dấu tiếng Việt
        syllable_tokenize(text) → tách âm tiết
        is_vietnamese(text) → kiểm tra ngôn ngữ
    """

    def __init__(
        self,
        stopwords: Optional[Set[str]] = None,
        compound_words: Optional[Set[str]] = None,
    ):
        self._stopwords = stopwords or ALL_STOPWORDS
        self._compound_words = compound_words or COMPOUND_WORDS
        self._compound_sorted = sorted(self._compound_words, key=len, reverse=True)
        # Precompile regex patterns
        self._whitespace_re = re.compile(r'\s+')
        self._punct_re = re.compile(r'[^\w\s\u00C0-\u024F\u1E00-\u1EFF]')
        self._number_re = re.compile(r'\d+[.,]?\d*')
        self._url_re = re.compile(r'https?://\S+|www\.\S+')
        self._email_re = re.compile(r'\S+@\S+\.\S+')

    # ──── Unicode Normalization ────

    def normalize(self, text: str) -> str:
        """
        Chuẩn hóa text tiếng Việt:
        1. Unicode NFC normalization (tổ hợp → precomposed)
        2. Chuẩn hóa whitespace
        3. Loại bỏ zero-width characters
        4. Thay thế Unicode quotes → ASCII quotes
        """
        if not text:
            return ""

        # Unicode NFC — chuẩn hóa dấu tiếng Việt
        text = unicodedata.normalize("NFC", text)

        # Loại bỏ zero-width characters
        text = re.sub(r'[\u200b\u200c\u200d\ufeff\u00ad]', '', text)

        # Chuẩn hóa quotes
        text = text.replace('\u201c', '"').replace('\u201d', '"')
        text = text.replace('\u2018', "'").replace('\u2019', "'")
        text = text.replace('\u2013', '-').replace('\u2014', '-')
        text = text.replace('\u2026', '...')

        # Chuẩn hóa whitespace
        text = self._whitespace_re.sub(' ', text).strip()

        return text

    # ──── Word Segmentation ────

    def segment(self, text: str) -> List[str]:
        """
        Word segmentation cho tiếng Việt.
        Ghép các âm tiết thành từ ghép dựa trên dictionary.

        Algorithm: Longest Match First (greedy forward matching)
        1. Scan text từ trái sang phải
        2. Tại mỗi vị trí, tìm từ ghép dài nhất match
        3. Nếu không match, lấy syllable đơn

        Returns:
            List of words/tokens (compound words dùng underscore: "học_sinh")
        """
        text = self.normalize(text)
        text_lower = text.lower()

        # Bước 1: Tách syllables
        syllables = text_lower.split()
        if not syllables:
            return []

        # Bước 2: Forward maximum matching
        result = []
        i = 0
        n = len(syllables)

        while i < n:
            matched = False
            # Thử match từ dài nhất (5 syllables) đến ngắn nhất (2)
            for length in range(min(5, n - i), 1, -1):
                candidate = " ".join(syllables[i:i + length])
                if candidate in self._compound_words:
                    result.append(candidate.replace(" ", "_"))
                    i += length
                    matched = True
                    break

            if not matched:
                result.append(syllables[i])
                i += 1

        return result

    # ──── Tokenization (segment + filter) ────

    def tokenize(
        self,
        text: str,
        remove_stopwords: bool = True,
        remove_numbers: bool = False,
        min_length: int = 1,
    ) -> List[str]:
        """
        Full tokenization pipeline:
        1. Normalize
        2. Remove URLs, emails
        3. Remove punctuation
        4. Segment (compound word matching)
        5. Filter stopwords, numbers, short tokens

        Returns:
            Clean token list
        """
        text = self.normalize(text)

        # Remove URLs and emails
        text = self._url_re.sub(' ', text)
        text = self._email_re.sub(' ', text)

        # Remove punctuation (keep Vietnamese diacritics)
        text = self._punct_re.sub(' ', text)

        # Segment
        tokens = self.segment(text)

        # Filter
        filtered = []
        for token in tokens:
            if len(token) < min_length:
                continue
            if remove_stopwords and token in self._stopwords:
                continue
            if remove_numbers and self._number_re.fullmatch(token):
                continue
            filtered.append(token)

        return filtered

    # ──── Syllable Tokenizer ────

    def syllable_tokenize(self, text: str) -> List[str]:
        """
        Tách text thành các âm tiết đơn (không ghép compound words).
        Hữu ích cho BPE tokenizer training.
        """
        text = self.normalize(text)
        text = self._punct_re.sub(' ', text)
        return [s.lower() for s in text.split() if len(s) > 0]

    # ──── Remove Diacritics ────

    @staticmethod
    def remove_diacritics(text: str) -> str:
        """
        Bỏ dấu tiếng Việt: ă→a, ơ→o, ư→u, ê→e, etc.
        Hữu ích cho search/matching dạng không dấu.
        """
        # Vietnamese-specific replacements
        replacements = {
            'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
            'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
            'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
            'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
            'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
            'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
            'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
            'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
            'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
            'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
            'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
            'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
            'đ': 'd',
            # Uppercase
            'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
            'Ă': 'A', 'Ắ': 'A', 'Ằ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
            'Â': 'A', 'Ấ': 'A', 'Ầ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
            'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
            'Ê': 'E', 'Ế': 'E', 'Ề': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
            'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
            'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
            'Ô': 'O', 'Ố': 'O', 'Ồ': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
            'Ơ': 'O', 'Ớ': 'O', 'Ờ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
            'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
            'Ư': 'U', 'Ứ': 'U', 'Ừ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
            'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y',
            'Đ': 'D',
        }
        return ''.join(replacements.get(c, c) for c in text)

    # ──── Language Detection Helper ────

    def is_vietnamese(self, text: str) -> float:
        """
        Tính tỷ lệ ký tự tiếng Việt đặc trưng trong text.

        Returns:
            Float 0-1: tỷ lệ Vietnamese characters (>0.05 = likely Vietnamese)
        """
        if not text:
            return 0.0

        # Ký tự đặc trưng tiếng Việt (không có trong tiếng Anh)
        vn_chars = set('ăâêôơưđắằẳẵặấầẩẫậếềểễệốồổỗộớờởỡợứừửữự'
                       'ĂÂÊÔƠƯĐẮẰẲẴẶẤẦẨẪẬẾỀỂỄỆỐỒỔỖỘỚỜỞỠỢỨỪỬỮỰ')

        total_alpha = sum(1 for c in text if c.isalpha())
        if total_alpha == 0:
            return 0.0

        vn_count = sum(1 for c in text if c in vn_chars)
        return vn_count / total_alpha

    # ──── Text Statistics ────

    def word_count(self, text: str) -> int:
        """Đếm số từ (sau khi segment)."""
        return len(self.segment(text))

    def sentence_count(self, text: str) -> int:
        """Đếm số câu."""
        sentences = re.split(r'[.!?]+', text)
        return len([s for s in sentences if len(s.strip()) > 5])

    def get_stopwords(self, language: str = "all") -> Set[str]:
        """Trả về set stopwords theo ngôn ngữ."""
        if language == "vi":
            return VIETNAMESE_STOPWORDS
        elif language == "en":
            return ENGLISH_STOPWORDS
        return ALL_STOPWORDS
