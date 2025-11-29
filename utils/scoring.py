from .text_processing import similarity

def score_list(items, cv_text):
    scores = []
    details = []

    for item in items:
        if len(item.strip()) < 5:
            continue

        sim = similarity(item, cv_text)
        score = round(sim * 5, 2)

        scores.append(score)
        details.append({
            "item": item,
            "score": score
        })

    if scores:
        return round(sum(scores) / len(scores), 2), details
    else:
        return 0, []
