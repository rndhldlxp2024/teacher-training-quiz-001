# -*- coding: utf-8 -*-
import json

with open("questions.js", "r", encoding="utf-8") as f:
    text = f.read()

start = text.find('[')
end = text.rfind(']') + 1
questions = json.loads(text[start:end])

unit_names = {
    1: "제1편 생활지도 및 학생 이해",
    2: "제2편 학교폭력·위기대응 및 교실 안전",
    3: "제3편 성희롱·성폭력 및 불법촬영 대응",
    4: "제4편 학부모 상담 및 특이민원 응대",
    5: "제5편 교직 문화, 동료 교사 및 관리자 관계",
    6: "제6편 교원 복무, 보수, 휴직 및 교권 보호"
}

circ_nums = ["①", "②", "③", "④", "⑤"]

md = []
md.append("# 📝 교직원 직무연수 시험 대비 종합 300제 및 해설집")
md.append("\n> **본 문제집은 교직원 연수 교재 전권(01강~60강, 291쪽)의 핵심 내용, 관련 교육 법령(교육공무원법, 국가공무원법, 초·중등교육법, 학교폭력예방법, 성폭력처벌법, 교원지위법 등), 생활지도 고시, 위기대응 매뉴얼을 바탕으로 엄선하여 제작된 시험 대비 실전 300문항 총괄 문제집입니다.**\n")
md.append("> **구성 체계: 제1편부터 제6편까지 편당 50문항씩 총 300문항 (5지선다 객관식 + OX 진위형 실전 문항, 정답 및 출처/상세 해설 수록)**\n\n---\n")

for u_id in range(1, 7):
    u_title = unit_names[u_id]
    u_questions = [q for q in questions if q["unitId"] == u_id]
    
    md.append(f"\n# [{u_title}] (50문항)\n")
    
    for q in u_questions:
        q_num = q["id"]
        q_chap = q["chapter"]
        q_type_str = "객관식" if q["type"] == "choice" else "OX 진위형"
        q_text = q["question"]
        
        md.append(f"### Q{q_num}. [{q_chap} / {q_type_str}]")
        md.append(f"**{q_text}**\n")
        
        for idx, opt in enumerate(q["options"]):
            if q["type"] == "choice":
                prefix = circ_nums[idx] if idx < len(circ_nums) else f"({idx+1})"
            else:
                prefix = f"[{idx+1}]"
            md.append(f"- {prefix} {opt}")
        
        # 정답 및 해설
        ans_idx = q["answer"]
        if q["type"] == "choice":
            ans_str = circ_nums[ans_idx] if ans_idx < len(circ_nums) else str(ans_idx+1)
        else:
            ans_str = q["options"][ans_idx]
            
        md.append(f"\n> **정답**: **{ans_str}**")
        md.append(f"> **출처**: {q.get('referencePage', '')}")
        md.append(f"> **해설**: {q.get('explanation', '')}\n")
        md.append("---\n")

with open("02_교원연수_시험대비_실전문제_및_해설집.md", "w", encoding="utf-8") as f:
    f.write("\n".join(md))

print(f"Successfully generated 02_교원연수_시험대비_실전문제_및_해설집.md with {len(questions)} questions!")
