from fastapi import FastAPI, File, Query, UploadFile
from fastapi.responses import JSONResponse

from grad_check import MAJORS, analyze, detect_major, parse_csv

app = FastAPI(title="卒業要件判定API")


@app.post("/api/check")
async def check_graduation(
    file: UploadFile = File(...),
    major: str | None = Query(None, enum=list(MAJORS.keys())),
):
    content = (await file.read()).decode("utf-8-sig")

    try:
        courses, student_name = parse_csv(content)
    except Exception as e:
        return JSONResponse({"error": f"CSV解析エラー: {e}"}, status_code=400)

    major_key = major
    if major_key is None:
        major_key = detect_major(courses)
    if major_key is None:
        return JSONResponse(
            {"error": "主専攻を自動検出できませんでした。major パラメータで指定してください。"},
            status_code=400,
        )

    result = analyze(courses, major_key)
    result["student_name"] = student_name
    return result
