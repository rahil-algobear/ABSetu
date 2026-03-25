"""
Resolve _title for entities and activities from their type's title_template.
"""

import re

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")


def resolve_title(
    title_template: str | None,
    meta: dict,
    dimension_values: list[dict] | None = None,
    field_defs: list[dict] | None = None,
    dimension_list: list | None = None,
) -> str:
    """Resolve a title template into a string.

    Args:
        title_template: e.g. "{a3x9_name} {b2y8_last_name}"
        meta: the entity/activity meta dict
        dimension_values: list of DimensionValue ORM objects
            (with .dimension relationship for key lookup)
        field_defs: list of field definition dicts from the meta schema
        dimension_list: list of Dimension ORM objects (for id→key mapping)

    Returns:
        Resolved title string, or empty string if no template.
    """
    if not title_template:
        return ""

    # Build dimension value lookup: field_key → value_name
    dim_lookup: dict[str, str] = {}
    if dimension_values and field_defs and dimension_list:
        dim_key_map = {str(d.id): d.key for d in dimension_list}
        for fd in field_defs:
            if fd.get("type") != "dimension":
                continue
            dim_id = fd.get("dimension_id")
            if not dim_id:
                continue
            dim_key = dim_key_map.get(str(dim_id))
            if not dim_key:
                continue
            for dv in dimension_values:
                if dv.dimension and dv.dimension.key == dim_key:
                    dim_lookup[fd["key"]] = dv.name
                    break

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        # Check dimension lookup first
        if key in dim_lookup:
            return dim_lookup[key]
        val = meta.get(key)
        if val is None or val == "":
            return ""
        return str(val)

    return _PLACEHOLDER_RE.sub(_replace, title_template).strip()


def compute_title(
    title_template: str | None,
    meta: dict,
    dimension_values: list | None = None,
    field_defs: list[dict] | None = None,
    dimension_list: list | None = None,
) -> dict:
    """Compute _title and merge it into meta. Returns the updated meta dict."""
    meta = dict(meta)
    title = resolve_title(
        title_template, meta,
        dimension_values=dimension_values,
        field_defs=field_defs,
        dimension_list=dimension_list,
    )
    if title:
        meta["_title"] = title
    else:
        meta.pop("_title", None)
    return meta
