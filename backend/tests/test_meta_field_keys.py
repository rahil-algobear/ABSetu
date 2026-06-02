"""Meta-field key-stability tests (Option A: a stable id pins the slug).

These guard the core invariant: a field's storage ``key`` (the slug used inside
each row's ``meta`` JSONB) must never change once assigned, so a schema edit can
never silently orphan historical values. The fix lives in
``MetaFieldSchemaService._ensure_field_keys``, which matches incoming fields to
the previously-stored schema by ``id`` and restores the stored id + key.
"""

import re

from app.modules.organization.service import MetaFieldSchemaService

ensure = MetaFieldSchemaService._ensure_field_keys
PREFIX = re.compile(r"^[a-z0-9]{4}_")


def test_new_field_gets_id_and_prefixed_key():
    (f,) = ensure([{"label": "Date", "type": "date"}])
    assert f["id"]
    assert PREFIX.search(f["key"])
    assert f["key"].endswith("_date")


def test_existing_field_keeps_id_and_key_on_edit():
    stored = ensure([{"label": "Date", "type": "date"}])
    fid, fkey = stored[0]["id"], stored[0]["key"]
    # Client edits the label and (as the buggy UI path did) sends a blank key.
    (f,) = ensure(
        [{"id": fid, "key": "", "label": "Session Date", "type": "date"}],
        existing=stored,
    )
    assert f["id"] == fid
    assert f["key"] == fkey  # slug pinned — values keyed by it stay reachable
    assert f["label"] == "Session Date"


def test_client_key_drift_is_ignored_for_existing_field():
    stored = ensure([{"label": "Date", "type": "date"}])
    fid, fkey = stored[0]["id"], stored[0]["key"]
    # Same id, bogus key from the client — must be overridden with the stored key.
    (f,) = ensure(
        [{"id": fid, "key": "zzzz_evil", "label": "Date", "type": "date"}],
        existing=stored,
    )
    assert f["key"] == fkey


def test_type_change_preserves_key():
    stored = ensure([{"label": "Count", "type": "text"}])
    fid, fkey = stored[0]["id"], stored[0]["key"]
    (f,) = ensure([{"id": fid, "label": "Count", "type": "number"}], existing=stored)
    assert f["key"] == fkey
    assert f["type"] == "number"


def test_reorder_preserves_all_keys():
    stored = ensure([{"label": "A", "type": "text"}, {"label": "B", "type": "text"}])
    reordered = ensure(list(reversed(stored)), existing=stored)
    by_id = {f["id"]: f["key"] for f in reordered}
    assert by_id == {f["id"]: f["key"] for f in stored}


def test_add_field_keeps_existing_and_assigns_new():
    stored = ensure([{"label": "Date", "type": "date"}])
    fid, fkey = stored[0]["id"], stored[0]["key"]
    result = ensure(stored + [{"label": "Notes", "type": "text"}], existing=stored)
    assert result[0]["id"] == fid and result[0]["key"] == fkey
    assert result[1]["id"] and result[1]["id"] != fid
    assert PREFIX.search(result[1]["key"]) and result[1]["key"] != fkey


def test_new_field_does_not_reclaim_deleted_field_key():
    stored = ensure([{"label": "Date", "type": "date"}])
    # The old field is removed and a brand-new one (no id) added in its place.
    (f,) = ensure([{"label": "Date", "type": "date"}], existing=stored)
    # New identity, and crucially a new slug — so it can't inherit the old
    # field's orphaned values.
    assert f["id"] != stored[0]["id"]
    assert f["key"] != stored[0]["key"]
