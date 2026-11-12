"""Offline tests for batch embeddings (Ollama mocked)."""
import pytest
import requests

import ingestion


class _Resp:
    def __init__(self, payload, status=200):
        self._p, self.status_code, self.text = payload, status, ""

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(response=self)

    def json(self):
        return self._p


def test_batch_endpoint_used_in_batches(monkeypatch):
    sent = []

    def post(url, json, timeout):
        sent.append((url, list(json.get("input", []))))
        return _Resp({"embeddings": [[float(len(t))] for t in json["input"]]})

    monkeypatch.setattr(ingestion.requests, "post", post)
    monkeypatch.setattr(ingestion, "EMBED_BATCH", 2)
    out = ingestion.get_ollama_embeddings(["a", "bb", "ccc"])
    assert out == [[1.0], [2.0], [3.0]]
    assert [len(b) for _, b in sent] == [2, 1] and all(u == ingestion.OLLAMA_EMBED_URL for u, _ in sent)


def test_failed_batch_falls_back_per_text_and_marks_failures(monkeypatch):
    def post(url, json, timeout):
        if url == ingestion.OLLAMA_EMBED_URL:
            return _Resp({}, status=500)
        if json["prompt"] == "bad":
            return _Resp({}, status=500)
        return _Resp({"embedding": [1.0]})

    monkeypatch.setattr(ingestion.requests, "post", post)
    assert ingestion.get_ollama_embeddings(["ok", "bad"]) == [[1.0], None]


def test_embed_num_ctx_is_sent_when_configured(monkeypatch):
    seen = {}

    def post(url, json, timeout):
        seen.update(json)
        return _Resp({"embeddings": [[0.0]]})

    monkeypatch.setattr(ingestion.requests, "post", post)
    monkeypatch.setattr(ingestion, "EMBED_NUM_CTX", 8192)
    ingestion.get_ollama_embeddings(["x"])
    assert seen["options"] == {"num_ctx": 8192}
