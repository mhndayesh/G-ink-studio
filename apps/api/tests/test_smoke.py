"""Run the end-to-end smoke workflow under pytest.

`smoke_test.py` is also runnable directly (`python tests/smoke_test.py`) and
prints a JSON report; here we just call its `main()` and let any AssertionError
fail the test. It uses an in-process FastAPI TestClient against a temp SQLite
registry — no server, Neo4j, Qdrant or LLM needed.
"""


def test_backend_smoke_workflow():
    from tests.smoke_test import main
    main()
