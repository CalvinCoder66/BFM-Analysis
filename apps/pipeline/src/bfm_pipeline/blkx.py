"""Loading `.blkx` files: the datamine's JSON rendering of War Thunder's BLK format."""

import json
from pathlib import Path
from typing import Any


def load_blkx(path: Path) -> Any:
    with path.open(encoding='utf-8') as f:
        return json.load(f)


def as_list(value: Any) -> list[Any]:
    """Repeatable blocks are an object when there is one and a list when there are several."""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def get_path(data: Any, dotted: str) -> Any:
    """Look up `A.B.C` in nested objects. Raises KeyError naming the missing part."""
    node = data
    for part in dotted.split('.') if dotted else []:
        if not isinstance(node, dict) or part not in node:
            raise KeyError(f'{dotted!r}: no {part!r}')
        node = node[part]
    return node
