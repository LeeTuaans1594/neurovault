"""
NEUROVAULT — Quiz Generator v4 (White-Box, Multilingual)
Tạo câu hỏi từ knowledge graph + chunks + LLM.

v4 Improvements:
- LLM-FIRST question generation (full question from LLM, template fallback)
- Bloom's Taxonomy levels (Remember→Create)
- LLM-powered SMART distractor generation (plausible wrong answers)
- True/False question type
- Explanation generation
- Difficulty calibration
- Deduplication
- Multilingual support (Vietnamese + English)
"""

import re
import json
import random
import hashlib
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Bloom's Taxonomy levels — English
BLOOM_LEVELS_EN = {
    1: {"name": "Remember", "verbs": ["define", "list", "state", "identify", "recall", "name"]},
    2: {"name": "Understand", "verbs": ["explain", "describe", "summarize", "classify", "compare"]},
    3: {"name": "Apply", "verbs": ["apply", "use", "solve", "demonstrate", "calculate"]},
    4: {"name": "Analyze", "verbs": ["analyze", "examine", "differentiate", "compare", "contrast"]},
    5: {"name": "Evaluate", "verbs": ["evaluate", "judge", "justify", "critique", "assess"]},
    6: {"name": "Create", "verbs": ["create", "design", "propose", "develop", "formulate"]},
}

# Bloom's Taxonomy levels — Vietnamese
BLOOM_LEVELS_VI = {
    1: {"name": "Nhớ", "verbs": ["định nghĩa", "liệt kê", "nêu", "nhận diện", "nhắc lại", "gọi tên"]},
    2: {"name": "Hiểu", "verbs": ["giải thích", "mô tả", "tóm tắt", "phân loại", "so sánh"]},
    3: {"name": "Áp dụng", "verbs": ["áp dụng", "sử dụng", "giải quyết", "minh họa", "tính toán"]},
    4: {"name": "Phân tích", "verbs": ["phân tích", "xem xét", "phân biệt", "so sánh", "đối chiếu"]},
    5: {"name": "Đánh giá", "verbs": ["đánh giá", "nhận xét", "lý giải", "phê bình", "thẩm định"]},
    6: {"name": "Sáng tạo", "verbs": ["sáng tạo", "thiết kế", "đề xuất", "phát triển", "xây dựng"]},
}

# Question templates per language
MCQ_TEMPLATES = {
    "en": {
        "remember": "According to the document, which statement about '{concept}' is correct?",
        "apply": "How would you {verb} the concept of '{concept}' based on the document?",
        "evaluate": "{verb} the role of '{concept}' as described in the document.",
    },
    "vi": {
        "remember": "Theo tài liệu, phát biểu nào sau đây về '{concept}' là đúng?",
        "apply": "Dựa trên tài liệu, hãy {verb} khái niệm '{concept}'?",
        "evaluate": "Hãy {verb} vai trò của '{concept}' như được mô tả trong tài liệu.",
    },
}

FILL_BLANK_TEMPLATES = {
    "en": "Fill in the blank: {blanked}",
    "vi": "Điền vào chỗ trống: {blanked}",
}

TF_TEMPLATES = {
    "en": "True or False: {statement}",
    "vi": "Đúng hay Sai: {statement}",
}

EXPLANATIONS = {
    "en": {
        "mcq": "This answer is found in the passage discussing {concept}.",
        "fill_blank": "The missing term is '{concept}'.",
        "tf_true": "This statement is directly supported by the document.",
        "tf_false": "The correct term should be '{concept}', not as stated.",
        "distractor_fallback": "{concept} is not discussed in this context",
        "tf_false_fallback": "{concept} is not related to the topics discussed in this document.",
    },
    "vi": {
        "mcq": "Câu trả lời này được tìm thấy trong đoạn văn thảo luận về {concept}.",
        "fill_blank": "Từ/cụm từ cần điền là '{concept}'.",
        "tf_true": "Phát biểu này được hỗ trợ trực tiếp bởi tài liệu.",
        "tf_false": "Từ đúng phải là '{concept}', không phải như đã nêu.",
        "distractor_fallback": "{concept} không được đề cập trong ngữ cảnh này",
        "tf_false_fallback": "{concept} không liên quan đến các chủ đề được thảo luận trong tài liệu này.",
    },
}

# Legacy alias for backward compatibility
BLOOM_LEVELS = BLOOM_LEVELS_EN


def _get_bloom_levels(language: str) -> Dict:
    """Get Bloom's Taxonomy levels for the given language."""
    if language == "vi":
        return BLOOM_LEVELS_VI
    return BLOOM_LEVELS_EN


def _get_lang_key(language: str) -> str:
    """Normalize language to template key ('vi' or 'en')."""
    return "vi" if language == "vi" else "en"


class QuizGenerator:
    """
    Generate quiz questions v2 from concepts and chunks.

    Question types:
    - MCQ (Multiple Choice)
    - Fill-blank
    - True/False
    - Short Answer (LLM-generated)

    Bloom's Taxonomy integration:
    - difficulty 0-0.3: Remember/Understand
    - difficulty 0.3-0.6: Apply/Analyze
    - difficulty 0.6-1.0: Evaluate/Create

    Multilingual: Vietnamese (vi) + English (en, default)
    """

    def __init__(self, llm_engine=None):
        self.llm = llm_engine

    def generate_from_concepts(
        self,
        concepts: List[Dict],
        chunks: List[Dict],
        num_questions: int = 10,
        difficulty: float = 0.5,
        language: str = "en",
    ) -> List[Dict]:
        """
        Generate quiz questions from extracted concepts.

        Strategy (v4 — LLM-first):
        1. If LLM available: generate full questions via LLM
        2. Supplement with template-based if LLM produces too few
        3. Always: set difficulty, bloom level, shuffle
        """
        lang = _get_lang_key(language)
        bloom_levels = _get_bloom_levels(language)
        bloom_level = self._difficulty_to_bloom(difficulty, bloom_levels)
        questions = []
        seen_hashes = set()

        # Strategy 1: LLM-first full generation
        if self.llm and hasattr(self.llm, 'is_available') and self.llm.is_available():
            llm_questions = self._generate_llm_questions(
                concepts=concepts,
                chunks=chunks,
                bloom_level=bloom_level,
                lang=lang,
                num_questions=num_questions,
            )
            for q in llm_questions:
                if self._dedup(q, seen_hashes):
                    questions.append(q)
            logger.info(f"[Quiz] LLM generated {len(questions)} questions")

        # Strategy 2: Template fallback to fill remaining slots
        remaining = num_questions - len(questions)
        if remaining > 0:
            template_qs = self._generate_template_questions(
                concepts=concepts,
                chunks=chunks,
                bloom_level=bloom_level,
                lang=lang,
                num_questions=remaining,
                seen_hashes=seen_hashes,
            )
            questions.extend(template_qs)
            if template_qs:
                logger.info(f"[Quiz] Template fallback added {len(template_qs)} questions")

        # Set difficulty and bloom level
        for q in questions:
            q["difficulty"] = difficulty
            q["bloom_level"] = bloom_level["name"]

        random.shuffle(questions)
        return questions[:num_questions]

    def _generate_template_questions(
        self,
        concepts: List[Dict],
        chunks: List[Dict],
        bloom_level: Dict,
        lang: str,
        num_questions: int,
        seen_hashes: set,
    ) -> List[Dict]:
        """Template-based question generation (reliable fallback)."""
        questions = []
        target_mcq = max(1, int(num_questions * 0.4))
        target_fill = max(1, int(num_questions * 0.3))
        target_tf = max(1, int(num_questions * 0.3))

        for concept in concepts[:num_questions * 3]:
            concept_name = concept.get("concept", "")
            if not concept_name:
                continue

            context = self._find_best_context(concept_name, chunks)
            if not context:
                continue

            if len([q for q in questions if q["question_type"] == "mcq"]) < target_mcq:
                q = self._generate_mcq(concept_name, context, concepts, bloom_level, lang)
                if q and self._dedup(q, seen_hashes):
                    questions.append(q)

            if len([q for q in questions if q["question_type"] == "fill_blank"]) < target_fill:
                q = self._generate_fill_blank(concept_name, context, lang)
                if q and self._dedup(q, seen_hashes):
                    questions.append(q)

            if len([q for q in questions if q["question_type"] == "true_false"]) < target_tf:
                q = self._generate_true_false(concept_name, context, concepts, lang)
                if q and self._dedup(q, seen_hashes):
                    questions.append(q)

            if len(questions) >= num_questions:
                break

        return questions

    def _generate_llm_questions(
        self,
        concepts: List[Dict],
        chunks: List[Dict],
        bloom_level: Dict,
        lang: str,
        num_questions: int,
        question_types: List[str] = None,
    ) -> List[Dict]:
        """
        Generate full questions using LLM with few-shot examples.
        v5: Better prompts, short answers, plausible distractors.
        """
        if question_types is None:
            question_types = ["mcq", "fill_blank", "true_false"]

        entries = []
        for concept in concepts[:num_questions * 3]:
            name = concept.get("concept", "")
            if not name:
                continue
            ctx = self._find_best_context(name, chunks)
            if ctx:
                definition = concept.get("definition", "")
                entries.append((name, ctx, definition))
            if len(entries) >= min(num_questions + 2, 10):
                break

        if not entries:
            return []

        context_block = "\n\n".join(
            f"Concept: {name}" + (f"\nDefinition: {defn}" if defn else "") + f"\nPassage: {ctx[:500]}"
            for name, ctx, defn in entries[:8]
        )

        types_str = ", ".join(question_types)

        if lang == "vi":
            system_prompt = (
                "Bạn là chuyên gia tạo câu hỏi quiz giáo dục chất lượng cao. "
                "CHỈ tạo câu hỏi dựa trên nội dung được cung cấp, KHÔNG thêm kiến thức bên ngoài. "
                "LUÔN trả về CHỈ một JSON array hợp lệ, không thêm text nào khác."
            )
            prompt = (
                f"Tạo CHÍNH XÁC {min(num_questions, len(entries))} câu hỏi quiz từ nội dung sau.\n"
                f"Mức Bloom: {bloom_level['name']}\n"
                f"Loại câu hỏi cho phép: {types_str}\n\n"
                f"### NỘI DUNG NGUỒN ###\n{context_block}\n### HẾT NỘI DUNG ###\n\n"
                f"QUY TẮC BẮT BUỘC:\n"
                f"1. CHỈ tạo câu hỏi từ thông tin CÓ TRONG nội dung nguồn. TUYỆT ĐỐI KHÔNG bịa thêm kiến thức.\n"
                f"2. MCQ: correct_answer PHẢI ngắn gọn (dưới 15 từ). Distractors phải CÙNG DẠNG với correct_answer (cùng loại từ, cùng độ dài), nghe hợp lý nhưng sai.\n"
                f"3. fill_blank: correct_answer PHẢI là MỘT thuật ngữ/từ khóa (1-3 từ). Tạo câu có chứa _______ thay cho từ khóa đó. KHÔNG BAO GIỜ để answer là cả câu dài.\n"
                f"4. true_false: Câu sai phải thay đổi TINH TẾ (đổi số liệu, đảo quan hệ, thêm phủ định) — KHÔNG thay concept thô.\n"
                f"5. Mỗi câu cần explanation ngắn gọn giải thích TẠI SAO đáp án đúng/sai.\n\n"
                f"VÍ DỤ MẪU (3 loại):\n"
                f'[{{"question_text":"Đâu là chức năng chính của mitochondria?","question_type":"mcq",'
                f'"correct_answer":"Sản xuất năng lượng ATP",'
                f'"distractors":["Tổng hợp protein","Lưu trữ thông tin di truyền","Phân giải chất thải"],'
                f'"source_concept":"mitochondria","explanation":"Mitochondria là nhà máy năng lượng của tế bào, tạo ATP qua hô hấp."}},'
                f'{{"question_text":"Điền vào chỗ trống: Quá trình thực vật chuyển ánh sáng thành năng lượng hóa học gọi là _______","question_type":"fill_blank",'
                f'"correct_answer":"quang hợp","distractors":[],'
                f'"source_concept":"quang hợp","explanation":"Quang hợp là quá trình thực vật dùng ánh sáng để tổng hợp chất hữu cơ."}},'
                f'{{"question_text":"Điền vào chỗ trống: Vật chất di truyền chính trong nhân tế bào là _______","question_type":"fill_blank",'
                f'"correct_answer":"DNA","distractors":[],'
                f'"source_concept":"DNA","explanation":"DNA (Deoxyribonucleic acid) là vật chất di truyền chính nằm trong nhân tế bào."}},'
                f'{{"question_text":"Đúng hay Sai: DNA có cấu trúc xoắn đơn gồm 3 chuỗi nucleotide","question_type":"true_false",'
                f'"correct_answer":"Sai","distractors":[],'
                f'"source_concept":"DNA","explanation":"DNA có cấu trúc xoắn KÉP gồm 2 chuỗi, không phải xoắn đơn 3 chuỗi."}}]\n\n'
                f"Trả về JSON array:"
            )
        else:
            system_prompt = (
                "You are an expert educational quiz creator. "
                "ONLY create questions based on the provided content, do NOT add external knowledge. "
                "ALWAYS return ONLY a valid JSON array, no other text."
            )
            prompt = (
                f"Generate EXACTLY {min(num_questions, len(entries))} quiz questions from this content.\n"
                f"Bloom's Level: {bloom_level['name']}\n"
                f"Allowed types: {types_str}\n\n"
                f"### SOURCE CONTENT ###\n{context_block}\n### END CONTENT ###\n\n"
                f"MANDATORY RULES:\n"
                f"1. ONLY create questions from facts IN the source content. NEVER invent or hallucinate facts.\n"
                f"2. MCQ: correct_answer MUST be under 15 words. Distractors MUST be the SAME TYPE as correct_answer (same word class, similar length), plausible but wrong.\n"
                f"3. fill_blank: correct_answer MUST be a SINGLE key term (1-3 words only). Create a sentence with _______ replacing that term. NEVER use a full sentence as the answer.\n"
                f"4. true_false: False statements must change something SUBTLE (numbers, relationships, add negation) — do NOT crudely swap concepts.\n"
                f"5. Each question needs a short explanation of WHY the answer is correct/incorrect.\n\n"
                f"EXAMPLES (3 types):\n"
                f'[{{"question_text":"What is the primary function of mitochondria?","question_type":"mcq",'
                f'"correct_answer":"Producing ATP energy",'
                f'"distractors":["Synthesizing proteins","Storing genetic information","Breaking down waste"],'
                f'"source_concept":"mitochondria","explanation":"Mitochondria produce ATP through cellular respiration."}},'
                f'{{"question_text":"Fill in the blank: The process by which plants convert light into chemical energy is called _______","question_type":"fill_blank",'
                f'"correct_answer":"photosynthesis","distractors":[],'
                f'"source_concept":"photosynthesis","explanation":"Photosynthesis converts sunlight into organic compounds."}},'
                f'{{"question_text":"Fill in the blank: The primary genetic material in the cell nucleus is _______","question_type":"fill_blank",'
                f'"correct_answer":"DNA","distractors":[],'
                f'"source_concept":"DNA","explanation":"DNA (Deoxyribonucleic acid) is the main genetic material."}},'
                f'{{"question_text":"True or False: DNA has a single-helix structure with 3 nucleotide chains","question_type":"true_false",'
                f'"correct_answer":"False","distractors":[],'
                f'"source_concept":"DNA","explanation":"DNA has a DOUBLE-helix with 2 chains, not single with 3."}}]\n\n'
                f"Return JSON array:"
            )

        # Try up to 2 times — low temperature for factual accuracy
        for attempt in range(2):
            try:
                result = self.llm.generate(
                    prompt=prompt,
                    system=system_prompt,
                    temperature=0.3,
                    max_tokens=3000,
                )

                if not result or result.startswith("[ERROR]"):
                    continue

                parsed = self._parse_llm_questions(result, question_types)
                if parsed:
                    # Source-grounding: verify answers exist in source content
                    grounded = []
                    for q in parsed:
                        if self._verify_source_grounding(q, context_block):
                            grounded.append(q)
                        else:
                            logger.debug(f"[Quiz] Rejected hallucinated question: {q['question_text'][:60]}")
                    if grounded:
                        return grounded

            except Exception as e:
                logger.warning(f"[Quiz] LLM generation attempt {attempt+1} failed: {e}")

        return []

    def _parse_llm_questions(self, raw: str, allowed_types: List[str] = None) -> List[Dict]:
        """Parse LLM JSON output into question dicts. Validates answer quality."""
        raw = raw.strip()

        if raw.startswith("```"):
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)

        start = raw.find('[')
        end = raw.rfind(']')
        if start == -1 or end == -1 or end <= start:
            return []

        json_str = raw[start:end + 1]

        try:
            questions = json.loads(json_str)
        except json.JSONDecodeError:
            logger.warning("[Quiz] Failed to parse LLM JSON output")
            return []

        if not isinstance(questions, list):
            return []

        if allowed_types is None:
            allowed_types = ["mcq", "fill_blank", "true_false"]

        valid = []
        for q in questions:
            if not isinstance(q, dict):
                continue
            if not q.get("question_text") or not q.get("correct_answer"):
                continue

            q_type = q.get("question_type", "mcq").lower().strip()
            if q_type not in ("mcq", "fill_blank", "true_false"):
                q_type = "mcq"

            # Filter by allowed types
            if q_type not in allowed_types:
                continue

            correct = str(q["correct_answer"]).strip()

            # Validate MCQ answer length — reject if too long
            if q_type == "mcq" and len(correct.split()) > 20:
                logger.debug(f"[Quiz] Skipping MCQ with answer too long: {len(correct.split())} words")
                continue

            # ★ CRITICAL: Validate fill_blank answer is SHORT (1-4 words max)
            if q_type == "fill_blank":
                answer_word_count = len(correct.split())
                if answer_word_count > 4:
                    logger.debug(f"[Quiz] Rejecting fill_blank with long answer ({answer_word_count} words): '{correct[:50]}'")
                    continue
                if answer_word_count < 1 or len(correct) < 2:
                    logger.debug(f"[Quiz] Rejecting fill_blank with empty/tiny answer: '{correct}'")
                    continue
                # Ensure question actually contains a blank marker
                q_text = str(q["question_text"]).strip()
                if '_' not in q_text and '______' not in q_text:
                    logger.debug(f"[Quiz] Rejecting fill_blank without blank marker")
                    continue

            normalized = {
                "question_text": str(q["question_text"]).strip(),
                "question_type": q_type,
                "correct_answer": correct,
                "distractors": [str(d).strip() for d in q.get("distractors", []) if d],
                "source_concept": str(q.get("source_concept", "")).strip(),
                "explanation": str(q.get("explanation", "")).strip(),
                "llm_generated": True,
            }

            # Ensure MCQ has enough distractors
            if q_type == "mcq" and len(normalized["distractors"]) < 2:
                continue

            # Validate true_false answer
            if q_type == "true_false":
                ans_lower = correct.lower()
                if ans_lower not in ("true", "false", "đúng", "sai"):
                    continue

            valid.append(normalized)

        logger.info(f"[Quiz] Parsed {len(valid)}/{len(questions)} LLM questions")
        return valid

    def _difficulty_to_bloom(self, difficulty: float, bloom_levels: Dict = None) -> Dict:
        """Map difficulty (0-1) to Bloom's Taxonomy level."""
        levels = bloom_levels or BLOOM_LEVELS_EN
        if difficulty < 0.2:
            return levels[1]  # Remember / Nhớ
        elif difficulty < 0.35:
            return levels[2]  # Understand / Hiểu
        elif difficulty < 0.5:
            return levels[3]  # Apply / Áp dụng
        elif difficulty < 0.7:
            return levels[4]  # Analyze / Phân tích
        elif difficulty < 0.85:
            return levels[5]  # Evaluate / Đánh giá
        else:
            return levels[6]  # Create / Sáng tạo

    def _verify_source_grounding(self, question: Dict, context_block: str) -> bool:
        """
        Anti-hallucination: verify that the answer is grounded in source content.
        Returns True if the answer has sufficient overlap with source text.
        """
        answer = question.get("correct_answer", "").lower().strip()
        source = context_block.lower()
        q_type = question.get("question_type", "")

        # True/False answers are always "True"/"False"/"Đúng"/"Sai" — skip check
        if q_type == "true_false":
            return True

        # For fill_blank: the answer term MUST appear in source
        if q_type == "fill_blank":
            return answer in source

        # For MCQ: at least 50% of answer words (>3 chars) must appear in source
        answer_words = [w for w in answer.split() if len(w) > 3]
        if not answer_words:
            return True  # Very short answer — allow
        matches = sum(1 for w in answer_words if w in source)
        return matches >= max(1, len(answer_words) * 0.5)

    def _find_best_context(self, concept: str, chunks: List[Dict]) -> Optional[str]:
        """Find the best chunk context for a concept."""
        best = None
        best_score = 0

        for chunk in chunks:
            text = chunk.get("text", "")
            if concept.lower() in text.lower():
                # Score by: how central the concept is in this chunk
                count = text.lower().count(concept.lower())
                # Prefer chunks where concept appears more + chunk is longer
                score = count * min(len(text), 500)
                if score > best_score:
                    best_score = score
                    best = text[:500]

        return best

    def _dedup(self, question: Dict, seen: set) -> bool:
        """Check and add question hash for deduplication."""
        h = hashlib.md5(question["question_text"].encode()).hexdigest()[:12]
        if h in seen:
            return False
        seen.add(h)
        return True

    def _generate_mcq(
        self, concept: str, context: str, all_concepts: List[Dict], bloom: Dict, lang: str = "en"
    ) -> Optional[Dict]:
        """Generate MCQ with SHORT correct answer (not full sentence)."""
        sentences = re.split(r'[.!?]+', context)
        target_sent = None
        for s in sentences:
            if concept.lower() in s.lower() and len(s.strip()) > 20:
                target_sent = s.strip()
                break

        if not target_sent:
            return None

        templates = MCQ_TEMPLATES.get(lang, MCQ_TEMPLATES["en"])
        explanations = EXPLANATIONS.get(lang, EXPLANATIONS["en"])

        verb = random.choice(bloom["verbs"])
        bloom_name = bloom["name"]

        if bloom_name in ("Remember", "Understand", "Nhớ", "Hiểu"):
            question_text = templates["remember"].format(concept=concept)
        elif bloom_name in ("Apply", "Analyze", "Áp dụng", "Phân tích"):
            question_text = templates["apply"].format(verb=verb, concept=concept)
        else:
            question_text = templates["evaluate"].format(verb=verb.capitalize(), concept=concept)

        # Extract SHORT correct answer — key fact about the concept
        correct_answer = self._extract_short_answer(concept, target_sent, lang)

        distractors = self._generate_smart_distractors(
            correct_answer=correct_answer,
            concept=concept,
            context=context,
            all_concepts=all_concepts,
            lang=lang,
        )

        return {
            "question_text": question_text,
            "question_type": "mcq",
            "correct_answer": correct_answer,
            "distractors": distractors[:3],
            "source_concept": concept,
            "explanation": explanations["mcq"].format(concept=concept),
        }

    def _extract_short_answer(self, concept: str, sentence: str, lang: str) -> str:
        """Extract a short factual answer from a sentence about a concept."""
        sent = sentence.strip()
        concept_lower = concept.lower()

        # Try to extract the predicate/definition part after the concept
        # Pattern: "<concept> is/are/refers to <ANSWER>"
        en_patterns = [
            rf'(?i){re.escape(concept)}\s+(?:is|are|was|were|refers to|means|represents)\s+(.+)',
            rf'(?i){re.escape(concept)}\s*[,—–]\s*(.+)',
        ]
        vi_patterns = [
            rf'(?i){re.escape(concept)}\s+(?:là|được gọi là|có nghĩa là)\s+(.+)',
            rf'(?i){re.escape(concept)}\s*[,—–]\s*(.+)',
        ]
        patterns = vi_patterns if lang == "vi" else en_patterns

        for pat in patterns:
            m = re.search(pat, sent)
            if m:
                answer = m.group(1).strip().rstrip('.')
                if 5 < len(answer) < 120:
                    return answer

        # Fallback: remove the concept from the sentence to get the fact
        # e.g. "Mitochondria produce ATP for cells" → "produce ATP for cells"
        remaining = re.sub(rf'(?i)\b{re.escape(concept)}\b', '', sent).strip()
        remaining = re.sub(r'^\s*[,;:\-—–]+\s*', '', remaining).strip()
        remaining = re.sub(r'^(?:is|are|was|were|that|which)\s+', '', remaining, flags=re.IGNORECASE).strip()

        if 5 < len(remaining) < 120:
            return remaining.rstrip('.')

        # Last resort: truncate sentence to ~80 chars at word boundary
        if len(sent) > 80:
            words = sent[:80].split()
            return ' '.join(words[:-1]).rstrip('.,;:')
        return sent.rstrip('.')

    def _generate_smart_distractors(
        self,
        correct_answer: str,
        concept: str,
        context: str,
        all_concepts: List[Dict],
        lang: str = "en",
        n: int = 3,
    ) -> List[str]:
        """
        Generate plausible but incorrect distractors.

        Strategy (priority order):
        1. LLM-generated (most plausible, context-aware)
        2. Context-aware sentence fragments (better than random)
        3. Concept substitution fallback (always works)
        """
        # Strategy 1: LLM-generated distractors
        if self.llm and hasattr(self.llm, 'is_available') and self.llm.is_available():
            llm_distractors = self._llm_distractors(correct_answer, concept, context, lang, n)
            if len(llm_distractors) >= n:
                return llm_distractors[:n]
            # Partial LLM results — supplement with fallback
            if llm_distractors:
                remaining = n - len(llm_distractors)
                fallback = self._rule_distractors(concept, context, all_concepts, lang, remaining)
                return (llm_distractors + fallback)[:n]

        # Strategy 2+3: Rule-based distractors
        return self._rule_distractors(concept, context, all_concepts, lang, n)

    def _llm_distractors(
        self, correct_answer: str, concept: str, context: str, lang: str, n: int
    ) -> List[str]:
        """Use LLM to generate plausible wrong answers."""
        try:
            if lang == "vi":
                prompt = (
                    f"Tạo {n} đáp án SAI nhưng có vẻ hợp lý cho câu hỏi trắc nghiệm.\n"
                    f"Chúng phải liên quan đến chủ đề nhưng sai về kiến thức.\n\n"
                    f"Ngữ cảnh: {context[:400]}\n"
                    f"Khái niệm: {concept}\n"
                    f"Đáp án đúng: {correct_answer[:150]}\n\n"
                    f"Trả về CHỈ {n} đáp án sai bằng tiếng Việt, mỗi đáp án trên 1 dòng:\n"
                )
            else:
                prompt = (
                    f"Generate {n} plausible but INCORRECT answers for this MCQ.\n"
                    f"They must be related to the topic but factually wrong.\n\n"
                    f"Context: {context[:400]}\n"
                    f"Key concept: {concept}\n"
                    f"Correct answer: {correct_answer[:150]}\n\n"
                    f"Return ONLY {n} wrong answers, one per line:\n"
                )

            result = self.llm.generate(
                prompt=prompt,
                system="You generate quiz distractors. Return only the wrong answers, one per line.",
                temperature=0.7,
                max_tokens=300,
            )

            if not result or result.startswith("[ERROR]"):
                return []

            # Parse lines — filter out empty, numbered prefixes, duplicates
            lines = []
            for line in result.strip().split('\n'):
                line = line.strip()
                if not line:
                    continue
                # Remove numbering: "1. ", "a) ", "- "
                line = re.sub(r'^\s*(?:\d+[.)\-]\s*|[a-dA-D][.)\-]\s*|-\s*)', '', line).strip()
                if len(line) > 5 and line.lower() != correct_answer.lower()[:len(line)]:
                    lines.append(line[:200])

            # Deduplicate
            seen = set()
            unique = []
            for l in lines:
                key = l.lower()[:30]
                if key not in seen:
                    seen.add(key)
                    unique.append(l)

            logger.info(f"[Quiz] LLM generated {len(unique)} distractors for '{concept}'")
            return unique[:n]

        except Exception as e:
            logger.warning(f"[Quiz] LLM distractor generation failed: {e}")
            return []

    def _rule_distractors(
        self, concept: str, context: str, all_concepts: List[Dict], lang: str, n: int
    ) -> List[str]:
        """
        Rule-based distractor generation (fallback).
        v5: Uses definition-style phrases from related concepts for plausibility.
        """
        distractors = []
        seen_lower = set()

        # Strategy A: Extract key phrases about OTHER concepts from the same context
        sentences = re.split(r'[.!?]+', context)
        other_concepts = [c["concept"] for c in all_concepts if c["concept"] != concept]

        for oc in other_concepts[:n * 2]:
            for s in sentences:
                if oc.lower() in s.lower() and concept.lower() not in s.lower() and len(s.strip()) > 15:
                    # Extract the predicate about the other concept
                    fact = s.strip()
                    # Remove the other concept name to make it look like a definition
                    short_fact = re.sub(rf'(?i)\b{re.escape(oc)}\b', '', fact).strip()
                    short_fact = re.sub(r'^\s*[,;:\-—–]+\s*', '', short_fact).strip()
                    short_fact = re.sub(r'^(?:is|are|was|were|that|which)\s+', '', short_fact, flags=re.IGNORECASE).strip()
                    if 8 < len(short_fact) < 150 and short_fact.lower() not in seen_lower:
                        seen_lower.add(short_fact.lower())
                        distractors.append(short_fact.rstrip('.'))
                    break
            if len(distractors) >= n:
                break

        # Strategy B: Use other concept names with generic predicate
        if len(distractors) < n:
            random.shuffle(other_concepts)
            generic_predicates_en = [
                "a related but distinct process",
                "a different mechanism entirely",
                "an alternative approach to the same problem",
            ]
            generic_predicates_vi = [
                "một quá trình liên quan nhưng khác biệt",
                "một cơ chế hoàn toàn khác",
                "một phương pháp thay thế cho cùng vấn đề",
            ]
            preds = generic_predicates_vi if lang == "vi" else generic_predicates_en
            for i, oc in enumerate(other_concepts):
                if len(distractors) >= n:
                    break
                pred = preds[i % len(preds)]
                distractor = f"{oc} — {pred}"
                if distractor.lower() not in seen_lower:
                    seen_lower.add(distractor.lower())
                    distractors.append(distractor)

        # Strategy C: Generate plausible-sounding but wrong variants
        # AVOID giveaway answers like "Not mentioned" — these are too easy to eliminate
        fallback_en = [
            f"an alternative form of {concept}",
            f"a process unrelated to {concept}",
            f"a different interpretation of the concept",
        ]
        fallback_vi = [
            f"một dạng khác của {concept}",
            f"một quá trình không liên quan đến {concept}",
            f"một cách hiểu khác về khái niệm này",
        ]
        fallbacks = fallback_vi if lang == "vi" else fallback_en
        fi = 0
        while len(distractors) < n:
            fb = fallbacks[fi % len(fallbacks)]
            if fb.lower() not in seen_lower:
                seen_lower.add(fb.lower())
                distractors.append(fb)
            fi += 1
            if fi > n * 3:  # Safety valve
                break

        return distractors[:n]

    def _generate_fill_blank(self, concept: str, context: str, lang: str = "en") -> Optional[Dict]:
        """Generate Fill-in-the-blank — answer MUST be a short key term (1-4 words)."""
        # ★ CRITICAL: Only generate fill_blank if concept is short enough to be a reasonable answer
        concept_word_count = len(concept.split())
        if concept_word_count > 4:
            logger.debug(f"[Quiz] Skipping fill_blank for long concept: '{concept}' ({concept_word_count} words)")
            return None

        sentences = re.split(r'[.!?]+', context)
        template = FILL_BLANK_TEMPLATES.get(lang, FILL_BLANK_TEMPLATES["en"])
        explanations = EXPLANATIONS.get(lang, EXPLANATIONS["en"])

        target_sent = None
        for s in sentences:
            if concept.lower() in s.lower() and len(s.strip()) > 25:
                target_sent = s.strip()
                break

        if not target_sent:
            return None

        # Try to restructure the sentence slightly instead of verbatim copy
        blanked_sent = self._restructure_for_blank(concept, target_sent, lang)

        if blanked_sent and "_______" in blanked_sent:
            return {
                "question_text": template.format(blanked=blanked_sent),
                "question_type": "fill_blank",
                "correct_answer": concept,
                "distractors": [],
                "source_concept": concept,
                "explanation": explanations["fill_blank"].format(concept=concept),
            }
        return None

    def _restructure_for_blank(self, concept: str, sentence: str, lang: str) -> Optional[str]:
        """Restructure a sentence for fill-in-the-blank (avoid verbatim copy)."""
        sent = sentence.strip().rstrip('.')

        # Strategy 1: If sentence starts with concept, restructure to definition-style
        if sent.lower().startswith(concept.lower()):
            # "Mitochondria produce ATP" → "The organelle that produces ATP is called _______"
            predicate = sent[len(concept):].strip()
            predicate = re.sub(r'^\s*[,;:\-—–]+\s*', '', predicate).strip()
            predicate = re.sub(r'^(?:is|are|was|were)\s+', '', predicate, flags=re.IGNORECASE).strip()

            if len(predicate) > 10:
                if lang == "vi":
                    return f"Khái niệm {predicate} được gọi là _______"
                else:
                    return f"The concept that {predicate} is called _______"

        # Strategy 2: Replace concept with blank in the sentence
        blanked = re.sub(
            re.escape(concept), "_______", sent,
            flags=re.IGNORECASE, count=1,
        )
        if "_______" in blanked:
            return blanked

        return None

    def _generate_true_false(
        self, concept: str, context: str, all_concepts: List[Dict], lang: str = "en"
    ) -> Optional[Dict]:
        """Generate True/False with SUBTLE falsification (not crude concept swaps)."""
        sentences = re.split(r'[.!?]+', context)
        target_sent = None
        for s in sentences:
            if concept.lower() in s.lower() and len(s.strip()) > 20:
                target_sent = s.strip()
                break

        if not target_sent:
            return None

        template = TF_TEMPLATES.get(lang, TF_TEMPLATES["en"])
        explanations = EXPLANATIONS.get(lang, EXPLANATIONS["en"])

        is_true = random.random() > 0.5

        if is_true:
            statement = target_sent[:200]
            correct_answer = "Đúng" if lang == "vi" else "True"
            explanation = explanations["tf_true"]
        else:
            # Apply SUBTLE falsification strategies
            statement, explanation = self._create_false_statement(
                target_sent, concept, all_concepts, lang
            )
            correct_answer = "Sai" if lang == "vi" else "False"

        return {
            "question_text": template.format(statement=statement),
            "question_type": "true_false",
            "correct_answer": correct_answer,
            "distractors": [],
            "source_concept": concept,
            "explanation": explanation,
        }

    def _create_false_statement(
        self, sentence: str, concept: str, all_concepts: List[Dict], lang: str
    ) -> tuple:
        """Create a subtly false statement using multiple strategies."""
        explanations = EXPLANATIONS.get(lang, EXPLANATIONS["en"])
        sent = sentence.strip()

        # Strategy 1: Negate the statement
        negated = self._negate_sentence(sent, lang)
        if negated and negated != sent:
            if lang == "vi":
                expl = f"Phát biểu gốc là đúng nhưng đã bị đảo ngược. Nội dung chính xác: {sent[:150]}"
            else:
                expl = f"The original statement is true but was negated. The correct fact: {sent[:150]}"
            return negated[:200], expl

        # Strategy 2: Change numbers/quantities
        num_modified = self._modify_numbers(sent)
        if num_modified and num_modified != sent:
            if lang == "vi":
                expl = f"Số liệu trong phát biểu đã bị thay đổi. Thông tin chính xác: {sent[:150]}"
            else:
                expl = f"Numbers in the statement were altered. Correct information: {sent[:150]}"
            return num_modified[:200], expl

        # Strategy 3: Reverse cause-effect or add wrong attribute
        reversed_sent = self._reverse_relationship(sent, lang)
        if reversed_sent and reversed_sent != sent:
            if lang == "vi":
                expl = f"Quan hệ trong phát biểu đã bị đảo ngược. Nội dung chính xác: {sent[:150]}"
            else:
                expl = f"The relationship was reversed. Correct fact: {sent[:150]}"
            return reversed_sent[:200], expl

        # Strategy 4 (fallback): Concept substitution — still better than before
        other = [c["concept"] for c in all_concepts if c["concept"] != concept]
        if other:
            replacement = random.choice(other)
            false_stmt = sent.replace(concept, replacement)[:200]
            expl = explanations["tf_false"].format(concept=concept)
            return false_stmt, expl

        # Last resort
        return explanations["tf_false_fallback"].format(concept=concept), explanations["tf_false"].format(concept=concept)

    def _negate_sentence(self, sentence: str, lang: str) -> Optional[str]:
        """Add or remove negation to create a false statement."""
        if lang == "vi":
            # Vietnamese negation
            if "không" in sentence.lower():
                return re.sub(r'\bkhông\s+', '', sentence, count=1, flags=re.IGNORECASE)
            # Add negation
            for verb in ['là', 'có', 'được', 'sẽ', 'đã', 'đang']:
                pattern = rf'\b({verb})\b'
                if re.search(pattern, sentence, re.IGNORECASE):
                    return re.sub(pattern, f'không {verb}', sentence, count=1, flags=re.IGNORECASE)
        else:
            # English negation
            if ' not ' in sentence.lower() or "n't" in sentence.lower():
                result = re.sub(r"\bnot\s+", '', sentence, count=1, flags=re.IGNORECASE)
                result = re.sub(r"n't\b", '', result, count=1, flags=re.IGNORECASE)
                return result.strip()
            # Add negation after auxiliary/be verbs
            for verb in ['is', 'are', 'was', 'were', 'has', 'have', 'had', 'can', 'will', 'does', 'do']:
                pattern = rf'\b({verb})\s+'
                if re.search(pattern, sentence, re.IGNORECASE):
                    return re.sub(pattern, rf'\1 not ', sentence, count=1, flags=re.IGNORECASE)
        return None

    def _modify_numbers(self, sentence: str) -> Optional[str]:
        """Change numbers in the sentence to create false statement."""
        numbers = re.findall(r'\b(\d+(?:\.\d+)?)\b', sentence)
        if not numbers:
            return None

        # Pick a random number and modify it
        target = random.choice(numbers)
        try:
            val = float(target)
            # Modify by 20-80% in a random direction
            factor = random.choice([0.3, 0.5, 1.5, 2.0, 3.0])
            new_val = val * factor
            if val == int(val):
                replacement = str(int(new_val))
            else:
                replacement = f"{new_val:.1f}"
            return sentence.replace(target, replacement, 1)
        except ValueError:
            return None

    def _reverse_relationship(self, sentence: str, lang: str) -> Optional[str]:
        """Reverse a cause-effect or comparison relationship."""
        if lang == "vi":
            swaps = [
                ('tăng', 'giảm'), ('giảm', 'tăng'),
                ('lớn hơn', 'nhỏ hơn'), ('nhỏ hơn', 'lớn hơn'),
                ('trước', 'sau'), ('sau', 'trước'),
                ('cao', 'thấp'), ('thấp', 'cao'),
                ('nhiều', 'ít'), ('ít', 'nhiều'),
                ('nhanh', 'chậm'), ('chậm', 'nhanh'),
            ]
        else:
            swaps = [
                ('increases', 'decreases'), ('decreases', 'increases'),
                ('larger', 'smaller'), ('smaller', 'larger'),
                ('before', 'after'), ('after', 'before'),
                ('higher', 'lower'), ('lower', 'higher'),
                ('more', 'less'), ('less', 'more'),
                ('faster', 'slower'), ('slower', 'faster'),
                ('positive', 'negative'), ('negative', 'positive'),
                ('always', 'never'), ('never', 'always'),
            ]
        for a, b in swaps:
            if a.lower() in sentence.lower():
                return re.sub(rf'\b{re.escape(a)}\b', b, sentence, count=1, flags=re.IGNORECASE)
        return None

    def _enhance_with_llm(
        self, questions: List[Dict], chunks: List[Dict], bloom: Dict, lang: str = "en"
    ) -> List[Dict]:
        """Use LLM to improve question quality, respecting language."""
        if not self.llm:
            return questions

        if lang == "vi":
            prompt_template = """Cải thiện câu hỏi quiz sau đây cho mục đích giáo dục.
Mức Bloom: {bloom_name}
Câu hỏi: {question}
Đáp án: {answer}

Trả về CHỈ câu hỏi đã cải thiện bằng TIẾNG VIỆT, không thêm gì khác."""
        else:
            prompt_template = """Improve this quiz question for educational quality.
Bloom's Level: {bloom_name}
Question: {question}
Answer: {answer}

Return ONLY the improved question text, nothing else."""

        for q in questions[:5]:  # Enhance first 5 to save compute
            prompt = prompt_template.format(
                bloom_name=bloom['name'],
                question=q['question_text'],
                answer=q['correct_answer'],
            )
            try:
                improved = self.llm.generate(prompt, temperature=0.3, max_tokens=200)
                if improved and not improved.startswith("[ERROR]") and len(improved) > 10:
                    q["question_text"] = improved.strip()
                    q["llm_enhanced"] = True
            except Exception:
                pass

        return questions
