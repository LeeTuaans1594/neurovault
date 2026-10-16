"""Single source of truth for evaluation fixtures.

Each spec describes a document's structure (headings + body) and the gold labels used to
score any pipeline (legacy or v2). `build_fixtures.py` renders these specs to DOCX/PDF and
writes `gold/<name>.json`, so the files and the gold labels can never drift apart.
"""

# ── Vietnamese DOCX: real heading styles (Heading 1–3), compound terms, one table ──
VI_DOCX = {
    "name": "vi_hoc_may",
    "language": "vi",
    "format": "docx",
    "title": "Nhập môn Học máy",
    "sections": [
        {"heading": "Chương 1. Tổng quan về học máy", "level": 1, "body": [
            "Học máy là một nhánh của trí tuệ nhân tạo, cho phép máy tính học từ dữ liệu huấn luyện "
            "mà không cần lập trình tường minh. Một mô hình học máy tốt phải khái quát hoá được trên "
            "dữ liệu mới chưa từng thấy.",
            "Quy trình học máy thường gồm thu thập dữ liệu, tiền xử lý dữ liệu, huấn luyện mô hình và "
            "đánh giá mô hình trên dữ liệu kiểm tra.",
        ]},
        {"heading": "1.1. Học có giám sát", "level": 2, "body": [
            "Học có giám sát sử dụng dữ liệu đã gán nhãn để huấn luyện mô hình. Bài toán phân loại và "
            "bài toán hồi quy là hai dạng phổ biến nhất của học có giám sát.",
            "Trong bài toán phân loại, đầu ra là một nhãn rời rạc, ví dụ phân loại thư rác.",
        ]},
        {"heading": "1.1.1. Hồi quy tuyến tính", "level": 3, "body": [
            "Hồi quy tuyến tính dự đoán một giá trị liên tục từ các đặc trưng đầu vào. Mô hình được tối "
            "ưu bằng cách cực tiểu hoá hàm mất mát bình phương trung bình.",
            "Hệ số của hồi quy tuyến tính có thể tìm bằng nghiệm giải tích hoặc bằng thuật toán hạ gradient.",
        ]},
        {"heading": "1.2. Học không giám sát", "level": 2, "body": [
            "Học không giám sát tìm cấu trúc ẩn trong dữ liệu chưa gán nhãn. Phân cụm là bài toán tiêu "
            "biểu, trong đó thuật toán K-means chia dữ liệu thành K cụm.",
            "Giảm chiều dữ liệu bằng phân tích thành phần chính cũng là một kỹ thuật học không giám sát.",
        ]},
        {"heading": "Chương 2. Mạng nơ-ron nhân tạo", "level": 1, "body": [
            "Mạng nơ-ron nhân tạo gồm nhiều lớp nơ-ron liên kết với nhau. Mỗi nơ-ron áp dụng hàm kích "
            "hoạt lên tổng có trọng số của các đầu vào.",
            "Hàm kích hoạt phổ biến gồm hàm sigmoid, hàm tanh và hàm ReLU.",
        ]},
        {"heading": "2.1. Lan truyền ngược", "level": 2, "body": [
            "Thuật toán lan truyền ngược tính đạo hàm của hàm mất mát theo từng trọng số của mạng. Sau "
            "đó thuật toán hạ gradient dùng các đạo hàm này để cập nhật trọng số.",
            "Tốc độ học quyết định độ lớn của mỗi bước cập nhật trọng số.",
        ]},
        {"heading": "2.2. Học sâu", "level": 2, "body": [
            "Học sâu sử dụng mạng nơ-ron có nhiều lớp ẩn để học biểu diễn phân cấp. Mạng nơ-ron tích "
            "chập rất hiệu quả cho bài toán nhận dạng hình ảnh.",
            "Mạng nơ-ron hồi tiếp phù hợp với dữ liệu chuỗi như văn bản và tiếng nói.",
        ]},
        {"heading": "2.2.1. Hiện tượng quá khớp", "level": 3, "body": [
            "Quá khớp xảy ra khi mô hình học thuộc dữ liệu huấn luyện nhưng dự đoán kém trên dữ liệu "
            "kiểm tra. Kỹ thuật dropout và chính quy hoá giúp giảm quá khớp.",
            "Dừng sớm cũng là một cách hiệu quả để tránh quá khớp khi huấn luyện mạng nơ-ron.",
        ]},
    ],
    "table": {
        "header": ["Thuật toán", "Loại", "Ứng dụng"],
        "rows": [
            ["Hồi quy tuyến tính", "Có giám sát", "Dự đoán giá nhà"],
            ["K-means", "Không giám sát", "Phân khúc khách hàng"],
            ["Mạng nơ-ron tích chập", "Học sâu", "Nhận dạng hình ảnh"],
        ],
    },
    "gold_concepts": [
        "học máy", "trí tuệ nhân tạo", "dữ liệu huấn luyện", "dữ liệu kiểm tra",
        "học có giám sát", "bài toán phân loại", "bài toán hồi quy", "hồi quy tuyến tính",
        "hàm mất mát", "hạ gradient", "học không giám sát", "phân cụm", "k-means",
        "phân tích thành phần chính", "mạng nơ-ron nhân tạo", "mạng nơ-ron", "nơ-ron",
        "hàm kích hoạt", "trọng số", "lan truyền ngược", "tốc độ học", "học sâu", "lớp ẩn",
        "mạng nơ-ron tích chập", "mạng nơ-ron hồi tiếp", "nhận dạng hình ảnh", "quá khớp",
        "dropout", "chính quy hoá", "dừng sớm",
    ],
    # Multi-syllable terms whose syllables must stay together (word-segmentation check)
    "gold_compounds": [
        "học máy", "trí tuệ nhân tạo", "dữ liệu huấn luyện", "hồi quy tuyến tính", "hàm mất mát",
        "hạ gradient", "phân cụm", "mạng nơ-ron", "hàm kích hoạt", "trọng số", "lan truyền ngược",
        "học sâu", "quá khớp", "chính quy hoá", "tốc độ học", "dừng sớm",
    ],
}

# ── English PDF: outline/TOC, header+footer noise, a two-column page, a table ──
EN_PDF = {
    "name": "en_information_retrieval",
    "language": "en",
    "format": "pdf",
    "title": "Introduction to Information Retrieval",
    "running_header": "Lecture Notes - Information Retrieval",
    "sections": [
        {"heading": "1 Indexing", "level": 1, "page": 2, "body": [
            "Indexing turns a document collection into data structures that support fast search. "
            "The two core steps are tokenization and building an inverted index.",
        ]},
        {"heading": "1.1 Tokenization", "level": 2, "page": 2, "body": [
            "Tokenization splits raw text into tokens. Normalization then lowercases tokens, and "
            "stemming reduces words such as connected and connection to the stem connect. "
            "Stop words like the and of are often removed to shrink the index.",
        ]},
        {"heading": "1.2 Inverted Index", "level": 2, "page": 2, "body": [
            "An inverted index maps every term to a postings list of the documents that contain it. "
            "Each posting can store the term frequency and the positions of the term, which enables "
            "phrase queries. Postings lists are sorted by document identifier so that intersection is fast.",
        ]},
        {"heading": "2 Ranking", "level": 1, "page": 3, "body": [
            "Ranking orders the matching documents by their estimated relevance to the query.",
        ]},
        {"heading": "2.1 Vector Space Model", "level": 2, "page": 3, "column": "left", "body": [
            "The vector space model represents queries and documents as vectors of term weights. "
            "TF-IDF weighting multiplies term frequency by inverse document frequency, so rare terms "
            "receive higher weights. Documents are ranked by the cosine similarity between the query "
            "vector and each document vector. Cosine similarity ignores document length because it "
            "only measures the angle between vectors. This makes long and short documents comparable.",
        ]},
        {"heading": "2.2 BM25", "level": 2, "page": 3, "column": "right", "body": [
            "BM25 is a probabilistic ranking function that improves on TF-IDF weighting. It applies "
            "term frequency saturation through the parameter k1, so repeated terms give diminishing "
            "returns. It also applies document length normalization through the parameter b. BM25 "
            "remains a strong baseline for keyword search and is the default in many search engines.",
        ]},
        {"heading": "3 Evaluation", "level": 1, "page": 4, "body": [
            "Evaluation measures how well a retrieval system satisfies information needs, using a test "
            "collection with relevance judgments.",
        ]},
        {"heading": "3.1 Precision and Recall", "level": 2, "page": 4, "body": [
            "Precision is the fraction of retrieved documents that are relevant. Recall is the fraction "
            "of relevant documents that are retrieved. The F1 score is the harmonic mean of precision "
            "and recall. Mean average precision summarizes ranking quality across many queries.",
        ]},
        {"heading": "3.2 Relevance Feedback", "level": 2, "page": 4, "body": [
            "Relevance feedback asks the user to mark relevant results and then reformulates the query. "
            "The Rocchio algorithm moves the query vector toward relevant documents. Pseudo relevance "
            "feedback assumes the top results are relevant and performs query expansion automatically.",
        ]},
    ],
    "table": {
        "page": 4,
        "header": ["System", "Precision", "Recall"],
        "rows": [["TF-IDF", "0.62", "0.55"], ["BM25", "0.71", "0.63"], ["BM25 + feedback", "0.74", "0.69"]],
    },
    "gold_concepts": [
        "information retrieval", "indexing", "tokenization", "normalization", "stemming",
        "stop words", "inverted index", "postings list", "term frequency", "phrase queries",
        "ranking", "vector space model", "tf-idf weighting", "inverse document frequency",
        "cosine similarity", "bm25", "term frequency saturation", "document length normalization",
        "evaluation", "test collection", "relevance judgments", "precision", "recall", "f1 score",
        "mean average precision", "relevance feedback", "rocchio algorithm",
        "pseudo relevance feedback", "query expansion",
    ],
    "gold_compounds": [],
    # Two-column page: the last sentence of the left column must come before the first of the right
    "reading_order": {
        "before": "This makes long and short documents comparable.",
        "after": "BM25 is a probabilistic ranking function",
    },
}

ALL_SPECS = [VI_DOCX, EN_PDF]
