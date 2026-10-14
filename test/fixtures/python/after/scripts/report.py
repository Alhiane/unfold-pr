import functools


def cached(fn):
    @functools.wraps(fn)
    def wrapper(*args):
        return fn(*args)
    return wrapper


class Report:
    def __init__(self, rows):
        self.rows = rows

    def build(self):
        def line(row):
            return f"{row['id']}: {self._label(row)}"
        return "\n".join(line(r) for r in self.rows)

    def _label(self, row):
        return row.get("name", "?").title()

    def _unused(self):
        return None


@cached
def render(rows):
    return Report(rows).build()
