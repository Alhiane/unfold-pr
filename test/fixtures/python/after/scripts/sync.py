import json


def load(path):
    with open(path) as f:
        return json.load(f)


def clean(rows):
    return [normalize(r) for r in rows if r.get("id")]


def normalize(row):
    row["email"] = row.get("email", "").strip().lower()
    return row


def main(path):
    rows = clean(load(path))
    print(f"{len(rows)} rows")


if __name__ == "__main__":
    main("data.json")
