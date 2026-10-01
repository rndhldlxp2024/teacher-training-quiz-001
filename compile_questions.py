# -*- coding: utf-8 -*-
import json
import unit1_data
import unit2_data
import unit3_data
import unit4_data
import unit5_data
import unit6_data

unit_configs = [
    (1, "제1편 생활지도 및 학생 이해", unit1_data.items),
    (2, "제2편 학교폭력·위기대응 및 교실 안전", unit2_data.items),
    (3, "제3편 성희롱·성폭력 및 불법촬영 대응", unit3_data.items),
    (4, "제4편 학부모 상담 및 특이민원 응대", unit4_data.items),
    (5, "제5편 교직 문화, 동료 교사 및 관리자 관계", unit5_data.items),
    (6, "제6편 교원 복무, 보수, 휴직 및 교권 보호", unit6_data.items),
]

all_questions = []
current_id = 1

for unit_id, unit_name, items in unit_configs:
    for item in items:
        q_obj = {
            "id": current_id,
            "unitId": unit_id,
            "unitName": unit_name,
            "chapter": item[0],
            "type": item[1],
            "question": item[2],
            "options": item[3],
            "answer": item[4],
            "explanation": item[5],
            "referencePage": item[6],
            "pdfPage": item[7]
        }
        all_questions.append(q_obj)
        current_id += 1

js_content = "// 교직원 연수 시험 대비 문제 데이터베이스 (총 300문항: 6개 편 x 50문항)\n"
js_content += "const quizQuestions = " + json.dumps(all_questions, ensure_ascii=False, indent=2) + ";\n\n"
js_content += "if (typeof module !== 'undefined' && module.exports) {\n  module.exports = quizQuestions;\n}\n"

with open("questions.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"Successfully generated questions.js with {len(all_questions)} questions!")
