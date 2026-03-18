"""Common slugify utility."""

import re


def slugify(name: str) -> str:
    """Generate a slug/key from a name.

    Lowercases, replaces non-alphanumeric characters with underscores,
    and strips leading/trailing underscores.

    Examples:
        slugify("Team Members") -> "team_members"
        slugify("Hello World!") -> "hello_world"
    """
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug.strip("_")
