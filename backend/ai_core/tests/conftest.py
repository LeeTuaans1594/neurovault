import os
import sys
import tempfile
from pathlib import Path

import pytest

AI_CORE_DIR = Path(__file__).resolve().parents[1]
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))

# Tests must never talk to a real Ollama / write into the real data folder by accident.
os.environ.setdefault("OLLAMA_URL", "http://127.0.0.1:9")  # closed port -> LLM reported offline
os.environ["AI_CORE_DATA_DIR"] = tempfile.mkdtemp(prefix="nv-test-data-")


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from api import ai_server

    with TestClient(ai_server.app) as c:
        yield c
