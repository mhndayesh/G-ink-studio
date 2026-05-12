"""Unit tests for app.services.thread_ids — stable relationship IDs + thread-ID backfill."""

from app.services import thread_ids as ti


def test_slugify_name():
    assert ti.slugify_name("Iron Takeda") == "iron_takeda"
    assert ti.slugify_name("  Kinji  Sato!! ") == "kinji_sato"
    assert ti.slugify_name("") == ""


def test_stable_rel_id_from_pair_is_order_sensitive_and_deterministic():
    assert ti.stable_rel_id_from_pair("Kinji Sato / Iron Takeda") == "rel_kinji_sato__iron_takeda"
    # same call twice -> identical
    assert ti.stable_rel_id_from_pair("A / B") == ti.stable_rel_id_from_pair("A / B")
    # missing the separator / a single name -> empty
    assert ti.stable_rel_id_from_pair("just one name") == ""
    assert ti.stable_rel_id_from_pair("") == ""


def test_backfill_thread_ids_is_callable_and_does_not_crash_on_minimal_input():
    # Full behaviour is exercised by the smoke test (it needs a populated context);
    # here we just guard the public signature + that empty input is a no-op-ish.
    out = ti.backfill_thread_ids(generated={}, context={})
    assert isinstance(out, dict)
