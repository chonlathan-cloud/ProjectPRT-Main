# ProjectPRT Business Logic

เอกสารนี้สรุป business logic ของ ProjectPRT จากโค้ดและเอกสารในโปรเจกต์ปัจจุบัน ทั้ง `ProjectPRT-BE` และ `ProjectPRT-FE` โดยอิงพฤติกรรมที่ระบบ implement อยู่จริงเป็นหลัก

## 1. ภาพรวมระบบ

ProjectPRT เป็นระบบบัญชีและเอกสารการเงินสำหรับจัดการ workflow การเบิกเงิน รับเงิน ปรับปรุงบัญชี อนุมัติเอกสาร แนบหลักฐาน และดู dashboard/report

ระบบใช้แนวคิดหลักแบบ Case-centric:

- `Case` คือหน่วยงานหลักของกระบวนการบัญชี 1 รายการ
- `Category` คือหมวดบัญชีที่ผู้ใช้เลือก และ map ไปยัง `account_code`
- `Document` คือ voucher ที่เกิดจาก Case เช่น `PV`, `RV`, `JV`
- `Attachment` คือไฟล์แนบ เช่น ใบ ปส, ใบเสร็จ, เอกสารอื่น
- `AuditLog` เก็บประวัติ action สำคัญ
- `User` และ `UserRole` ใช้ควบคุมสิทธิ์การใช้งาน

แนวคิดเดิมใน spec พูดถึง `PS/CR/DB` แต่โค้ดปัจจุบัน refactor มาเป็น voucher system:

- `PV` = Payment Voucher สำหรับรายจ่าย
- `RV` = Receive Voucher สำหรับรายรับหรือเงินคืน
- `JV` = Journal Voucher สำหรับปรับปรุงบัญชีหรือรวมหลาย Case

## 2. Actors และ Role

ระบบมี role หลักดังนี้:

| Role | หน้าที่หลัก |
| --- | --- |
| `requester` | ใช้เฉพาะหน้า Form และ Document Manager: สร้าง Case, upload ไฟล์, submit เอกสาร, ดู/ค้นหาเอกสารของตัวเอง |
| `approver` | Role สูงสุด อนุมัติ/ปฏิเสธ Case และทำทุก action ที่ `admin` ทำได้ |
| `finance` | ตรวจสอบ/ดูรายการด้านการเงินตามสิทธิ์ |
| `accounting` | จัดการ category, ดูข้อมูลบัญชี |
| `treasury` | mark payment เป็น paid |
| `admin` | จัดการ user/role, มีสิทธิ์กว้างสุด |
| `executive` | ดูภาพรวม dashboard/report |
| `viewer` | ดู dashboard บาง endpoint |

Business rule ด้านสิทธิ์:

- ผู้ใช้ต้อง login ก่อนเรียก API ส่วนใหญ่
- สมัครสมาชิกใหม่จะได้ role default เป็น `requester` และ `is_approved = false`
- User ที่ `is_approved = false` จะ login หรือใช้งานระบบไม่ได้จนกว่า `admin` หรือ `approver` จะอนุมัติ
- Google SSO user คนแรก หรือ user ที่ตรงกับ bootstrap admin config จะได้ `admin`
- Admin จัดการ role ทั่วไปของ user ผ่าน `/api/v1/admin/users/{user_id}/roles`
- Role `approver` inherit สิทธิ์ของ `admin` ทั้งหมด
- Role `approver` เป็น system-managed role สำหรับผู้อนุมัติ 1-2 คนต่อองค์กร ถ้าต้องเพิ่ม/เปลี่ยนผู้อนุมัติให้ติดต่อ system creator โดยตรง
- User ที่มีเฉพาะ role `requester` ถูกจำกัดให้เข้าได้เฉพาะหน้า `Form` และ `Document Manager`
- การลบ user เป็น soft delete โดยตั้ง `is_active = false`
- User ที่ `is_active = false` จะ login หรือใช้งานต่อไม่ได้

## 3. Master Data: Category และ Account Code

`Category` เป็น master data ที่ควบคุมหมวดบัญชีและเลขบัญชี

Category มี field สำคัญ:

- `name_th`: ชื่อหมวดบัญชีภาษาไทย
- `type`: `EXPENSE`, `REVENUE`, หรือ `ASSET`
- `account_code`: รหัสบัญชี
- `is_active`: ใช้ซ่อนหรือปิดใช้งาน category โดยไม่ลบข้อมูลจริง

Business rules:

- สร้างและแก้ไข Category ได้เฉพาะ `accounting` หรือ `admin`
- `name_th` ต้องไม่ซ้ำ
- `account_code` ต้องไม่ซ้ำ
- Category ที่ inactive ใช้สร้าง Case ใหม่ไม่ได้
- Frontend ดึง Category ตามประเภทเอกสาร:
  - PV ใช้ `EXPENSE`
  - RV ใช้ `REVENUE`
  - Bank/deposit account ใช้ `ASSET`
- Revenue income type report ใช้ revenue code เฉพาะกลุ่ม `401` ถึง `408`

## 4. Case

`Case` คือรายการธุรกรรมหลักของระบบ

Field สำคัญ:

- `case_no`: เลข Case รูปแบบ `CAS-YYMMDD-XXXXXX`
- `category_id`: หมวดบัญชีที่เลือก
- `account_code`: copy จาก Category ตอนสร้าง Case เพื่อคงค่าทางบัญชีไว้
- `requester_id`: ผู้สร้างรายการ
- `requested_amount`: จำนวนเงิน
- `purpose`: วัตถุประสงค์หรือรายละเอียด
- `status`: สถานะ workflow
- `deposit_account_id`: บัญชีปลายทางสำหรับ RV หรือ case ประเภทรับเงิน
- `is_receipt_uploaded`: ระบุว่ามีการ upload ใบเสร็จแล้วหรือยัง
- `approved_by`, `approved_at`: ข้อมูลผู้อนุมัติ
- `reject_reason`, `rejected_at`: ข้อมูลการปฏิเสธ

Business rules ตอนสร้าง Case:

- ต้องเลือก Category ที่มีอยู่จริง
- Category ต้อง active
- `requested_amount` ต้องมากกว่า 0
- `purpose` ต้องไม่ว่าง
- ถ้า Category เป็น `REVENUE` หรือ `ASSET` ต้องส่ง `deposit_account_id`
- ระบบ copy `account_code` จาก Category ลง Case ทันที
- Case เริ่มต้นด้วย status `DRAFT`
- ระบบบันทึก audit action `create`

## 5. Document และ Voucher Numbering

`Document` คือ voucher ที่ผูกกับ Case

Document type ปัจจุบัน:

- `PV`: รายจ่าย
- `RV`: รายรับ
- `JV`: ปรับปรุงบัญชี/รวมหลาย Case

Business rules:

- 1 Case มี Document แต่ละ type ได้อย่างละ 1 เท่านั้น โดย constraint `UNIQUE(case_id, doc_type)`
- `doc_no` ต้อง unique ทั้งระบบ
- เลขเอกสารสร้างจาก `doc_counters`
- Format เลขเอกสารคือ `{DOC_TYPE}-YYMM-####` เช่น `PV-2605-0001`
- Counter แยกตาม `doc_type` และเดือน `YYMM`
- การ generate เลขใช้ row lock ผ่าน `with_for_update()` เพื่อกันเลขซ้ำเมื่อมีหลาย request พร้อมกัน

Mapping จาก Category ไป Document ตอน submit Case:

- Category type `EXPENSE` -> สร้าง `PV`
- Category type `REVENUE` -> สร้าง `RV`
- Category type อื่น เช่น `ASSET` -> สร้าง `JV`

## 6. Workflow หลักของ PV/RV

### 6.1 Create Case

Requester สร้าง Case จากหน้า Form หรือ API:

1. เลือกประเภทเอกสาร
2. เลือก Category
3. ใส่รายละเอียดและจำนวนเงิน
4. ระบบสร้าง Case เป็น `DRAFT`

Frontend คำนวณยอดรวมจาก item lines:

- PV: `quantity * price` รวมทุก item
- RV: รวม `price` ของทุก item
- ถ้า total <= 0 จะไม่ให้ submit
- ถ้าไม่มี purpose ระบบใช้ค่า fallback เป็น `ค่าใช้จ่ายทั่วไป`

### 6.2 Submit Case

Endpoint: `POST /api/v1/cases/{case_id}/submit`

Business rules:

- submit ได้เฉพาะเจ้าของ Case
- Case ต้องอยู่ใน `DRAFT`
- ถ้ายังไม่มี Document ระบบสร้างเลขเอกสารและ Document ให้
- Document เริ่มด้วย `pdf_uri = "pending-approval"`
- Case เปลี่ยนเป็น `SUBMITTED`
- ระบบบันทึก audit action `submit_and_gen_no`

สำหรับ PV บน frontend:

- ผู้ใช้ต้อง upload ใบ ปส เป็น attachment type `PS` ก่อน submit
- ถ้า upload ใบ ปส ไม่สำเร็จ ระบบไม่ submit Case เข้า approval flow

### 6.3 Approve Case

Endpoint: `POST /api/v1/cases/{case_id}/approve`

ผู้อนุมัติ: `approver`

Business rules:

- อนุมัติได้เฉพาะ Case สถานะ `SUBMITTED`
- Case ต้องมี Document แล้ว
- ผู้อนุมัติต้องมี display name เพื่อใช้ stamp บน PDF
- ต้องมี attachment type `PS`
- PS attachment ต้องเป็น PDF
- ระบบ download PDF เดิมจาก GCS แล้ว stamp ข้อความอนุมัติลง PDF
- ระบบ upload approved PDF กลับเข้า GCS
- `doc.pdf_uri` เปลี่ยนเป็น path ของ approved PDF
- `approved_by`, `approved_at` ถูกบันทึกใน Case
- ระบบบันทึก audit action `approve`

สถานะหลังอนุมัติ:

- ถ้า Category เป็น `EXPENSE` -> Case เป็น `APPROVED`
- ถ้า Category ไม่ใช่ `EXPENSE` เช่น `REVENUE` -> Case เป็น `CLOSED`

### 6.4 Reject Case

Endpoint: `POST /api/v1/cases/{case_id}/reject`

ผู้ปฏิเสธ: `approver`

Business rules:

- ปฏิเสธได้เฉพาะ Case สถานะ `SUBMITTED`
- ต้องระบุเหตุผล ไม่ให้ส่งค่าว่าง
- Case เปลี่ยนเป็น `REJECTED`
- บันทึก `reject_reason` และ `rejected_at`
- ระบบบันทึก audit action `reject`

### 6.5 Mark Paid

Endpoint: `POST /api/v1/cases/{case_id}/pay`

ผู้ทำรายการ: `treasury` หรือ `admin`

Business rules:

- จ่ายเงินได้เฉพาะ Case สถานะ `APPROVED`
- เมื่อจ่ายแล้ว Case เปลี่ยนเป็น `PAID`
- โค้ดปัจจุบัน update เฉพาะ status ยังไม่ได้สร้าง row ใน `payments`

### 6.6 Receipt Upload

Endpoint หลัก:

- `POST /api/v1/cases/{case_id}/upload-receipt`
- `POST /api/v1/files/upload`

Business rules:

- Upload file ไปที่ GCS
- บันทึก metadata ลง `attachments`
- ถ้า attachment type เป็น `RECEIPT` ให้ set `cases.is_receipt_uploaded = true`
- Document Manager ใช้ field นี้เพื่อแยกรายการที่ยังไม่มีใบเสร็จ

## 7. JV Workflow

JV ใช้สำหรับรวมหลาย Case หรือทำ adjustment/closing

Frontend flow:

1. ผู้ใช้เลือกเอกสาร type `JV`
2. ค้นหาเอกสารด้วยเลข PV/RV/JV
3. Pull Case ที่ต้องการรวมเข้ามา
4. เลือก `main_case_id`
5. ระบบส่ง `main_case_id` และ `linked_case_ids` ไป backend

Endpoint: `POST /api/v1/documents/jv`

Business rules:

- ต้องมี main case
- 1 main case สร้าง JV ได้ครั้งเดียว
- ระบบรวมยอดจาก `requested_amount` ของ main case และ linked cases
- สร้าง Document type `JV`
- สร้าง `jv_line_items` เพื่อ link JV กลับไปหาแต่ละ Case
- ทุก Case ที่ถูก link จะถูก set status เป็น `CLOSED`
- ถ้ามี JV อยู่แล้วสำหรับ main case จะได้ error `409`

ข้อควรระวัง:

- โค้ดปัจจุบันยังไม่ได้ enforce role บน endpoint สร้าง JV
- การรวมยอดใช้ `Case.requested_amount` ไม่ได้ดึงยอดจาก Document โดยตรง

## 8. File และ GCS

ระบบเก็บไฟล์ใน Google Cloud Storage

Business rules:

- File upload สร้าง object name จาก case/document folder และ timestamp
- Attachment เก็บ `gcs_uri` เป็น object path หรือ URI
- File list จะรวม:
  - approved PDF จาก `documents.pdf_uri`
  - attachments ทั้งหมดของ Case
- การดูไฟล์ใช้ signed/download URL ที่ backend generate ให้
- Dashboard และ Insights เลือกไฟล์ที่ควร preview โดย priority:
  - approved PDF
  - receipt
  - attachment อื่น

ประเภท attachment:

- `QUOTE`
- `RECEIPT`
- `PS`
- `SIGNATURE`
- `OTHER`

## 9. Dashboard

Frontend ปัจจุบันเรียก dashboard ผ่าน `GET /api/v1/documents?year=YYYY`

Dashboard summary:

- รายรับ = sum `Document.amount` ที่ `doc_type = RV`
- รายจ่าย = sum `Document.amount` ที่ `doc_type = PV`
- เงินคงเหลือ = รายรับ - รายจ่าย

Business rules ของ endpoint `/api/v1/documents`:

- ดูได้โดย `admin`, `accounting`, `viewer`, หรือ `approver`
- กรองตามปีของ `Document.created_at`
- ไม่นับ Case สถานะ `DRAFT`, `CANCELLED`, `REJECTED`, `SUBMITTED`
- Monthly chart แสดงเฉพาะ PV
- Activity chart group PV ตาม Category
- Latest transactions แสดง Document ล่าสุด 5 รายการ

มีอีก endpoint `GET /api/v1/dashboard` ที่ logic ใกล้เคียงกัน แต่ใช้ `VALID_STATUSES = [APPROVED]` และเปิดให้ `executive`/`approver` ด้วย

ข้อสังเกต:

- Spec เดิมระบุว่า dashboard/P&L ควรยึด DB เป็น source of truth แต่ระบบปัจจุบันเปลี่ยนเป็น PV/RV/JV แล้ว
- Dashboard ปัจจุบันใช้ `Document.amount` ของ PV/RV เป็น source หลัก และ exclude/แยก JV ตามบาง endpoint

## 10. Insights

Endpoint: `GET /api/v1/insights/`

Filter ที่รองรับ:

- `user_id`
- `category_id`
- `category_type`
- `month`
- `year`

Business rules:

- ใช้ `Case.created_at` สำหรับ filter เดือน/ปี
- ดึง Case พร้อม documents
- นับเฉพาะ Case status:
  - `DRAFT`
  - `SUBMITTED`
  - `APPROVED`
  - `PAID`
  - `CLOSED`
- Pending = `SUBMITTED`
- Approved = `APPROVED`, `PAID`, `CLOSED`
- ยอดเงินใช้ `Case.requested_amount`
- รายการ transaction แสดง doc_no จาก documents ทั้งหมดของ Case ถ้าไม่มีจะแสดง `-`

## 11. Profit & Loss

Endpoint: `GET /api/v1/profit-loss?year=YYYY`

Business rules:

- `year` เป็นปี พ.ศ. เช่น `2565`
- ช่วง fiscal year คือ 1 ต.ค. ของปีก่อนหน้า ถึงก่อน 1 ต.ค. ของปีที่เลือก
- ใช้ Case ที่ status เป็น `APPROVED` หรือ `CLOSED`
- ใช้ Category type `EXPENSE` และ `REVENUE`
- Group ยอดตาม `Category.account_code`
- ยอดที่ใช้คือ `Case.requested_amount`
- Output ถูกจัดลง template:
  - `งบดำเนินการ`
  - `งบนอก`
  - `งบอุดหนุน`

Frontend Profit & Loss มี 2 mode:

- Official Template mode: ดึงข้อมูลจาก backend แล้ว merge กับ template
- Excel mode: import `.xlsx` หรือ `.xls` เพื่อ preview/print รายงานจากไฟล์

ข้อสังเกต:

- Profit & Loss ปัจจุบันไม่ได้ใช้ `Document.amount`
- ถ้าต้องการ strict accounting source of truth ควรปรับให้ใช้ Document PV/RV หรือ settlement document ตามนโยบายล่าสุด

## 12. Chat / AI Assistant

Endpoint: `POST /api/v1/chat`

Business rules:

- ต้อง login ก่อนใช้งาน
- Chat เป็น assistant เท่านั้น ไม่ใช่ source of truth
- AI ตอบภาษาไทย
- AI เรียก tool เพื่อค้นหาและคำนวณข้อมูลจาก database
- ห้ามรวม JV ในยอด spending, expense, income เว้นแต่ user ถามถึง JV โดยตรง

Tools ที่ Chat ใช้:

- ค้นหาเอกสารด้วยเลข PV/RV หรือ Case No
- สรุปรายรับ/รายจ่ายตามช่วงวันที่
- เช็ค workflow status ของเอกสารหรือ Case
- ตอบ policy mock เช่น ค่าอาหาร ค่าเดินทาง ค่าที่พัก
- เปรียบเทียบยอดจ่ายเดือนนี้กับเดือนก่อน

ข้อจำกัด:

- Policy data ปัจจุบันเป็น mock text ในโค้ด
- Chat ไม่ควรสร้างหรือแก้ไขข้อมูลบัญชีโดยตรง
- Category และข้อมูลที่ persist ต้องมาจาก structured API ไม่ใช่ข้อความ free text จาก AI

## 13. Admin/User Management

Admin APIs:

- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{user_id}`
- `POST /api/v1/admin/users/{user_id}/approve`
- `POST /api/v1/admin/users/{user_id}/roles`
- `DELETE /api/v1/admin/users/{user_id}`

Business rules:

- ทุก endpoint ใช้ได้เฉพาะ `admin` หรือ `approver`
- List users แสดงเฉพาะ user ที่ active รวมถึง user ที่รออนุมัติ
- Approve user ตั้ง `is_approved = true` และเปิดให้ user login ได้
- Update user แก้ `name` และ `position`
- Update roles replace role เดิมทั้งหมดด้วย role ใหม่
- Role ที่ส่งมาต้องอยู่ใน set ที่ระบบรองรับ
- Role `approver` ไม่สามารถเพิ่ม/ลบผ่าน endpoint นี้ เพราะเป็น system-managed role
- Delete user คือ soft delete โดย set `is_active = false`

## 14. Search และ Document Manager

Document Manager ใช้สำหรับค้นหาเอกสารและจัดการไฟล์ที่ยังขาด

Business rules:

- Default แสดงเฉพาะรายการที่ `is_receipt_uploaded = false`
- ค้นหาเอกสารจาก `doc_no`
- รองรับ pagination
- ผู้ใช้เลือก Case แล้ว upload receipt ได้
- เมื่อ upload receipt สำเร็จ ระบบ refresh list และรายการนั้นจะไม่อยู่ใน missing-only view

Case visibility:

- Role ที่เห็นทุก Case: `approver`, `finance`, `accounting`, `admin`, `executive`, `treasury`
- Requester เห็นเฉพาะ Case ของตัวเอง
- Requester-only user ใช้ Document Manager ได้ครบสำหรับเอกสารที่ตัวเองมีสิทธิ์เห็น แต่ไม่มีสิทธิ์ approve/reject, dashboard, insights, profit/loss, chat หรือ user management

## 15. Audit Log

Audit log ใช้เก็บ action สำคัญของระบบ

Action ที่โค้ดปัจจุบัน log:

- สร้าง Case: `create`
- Submit Case และ generate doc no: `submit_and_gen_no`
- Approve Case: `approve`
- Reject Case: `reject`
- สร้าง/update/deactivate Category: `create`, `update`, `deactivate`

Business rules:

- Audit log เป็น append-only ตามแนวคิดระบบ
- Caller เป็นคน commit transaction หลังเรียก `log_audit_event`
- `details_json` เก็บข้อมูลประกอบ เช่น old/new status, doc_no, approved PDF URI, reject reason

## 16. Legacy Transaction V1

ระบบยังมี `transactions_v1` สำหรับรายการ income/expense แบบเก่า

Endpoint: `POST /api/v1/transactions`

Business rules:

- ใช้ได้เฉพาะ `admin` หรือ `accounting`
- `type` ต้องเป็น `income` หรือ `expense`
- `occurred_at` ต้องเป็น format `YYYY-MM-DD`
- ใช้สำหรับ phase/read-only dashboard เดิมหรือ seed data บางชุด
- ไม่ใช่ core voucher workflow ปัจจุบัน

## 17. State Machine ปัจจุบัน

สถานะของ Case ในโค้ดปัจจุบัน:

| Status | ความหมาย |
| --- | --- |
| `DRAFT` | สร้าง Case แล้ว แต่ยังไม่ submit |
| `SUBMITTED` | ส่งเข้า approval แล้ว มีเลข voucher แล้ว |
| `APPROVED` | อนุมัติแล้ว สำหรับ expense/PV |
| `REJECTED` | ถูกปฏิเสธ พร้อมเหตุผล |
| `PAID` | Treasury mark paid แล้ว |
| `CLOSED` | ปิดรายการแล้ว หรือ revenue/non-expense ถูกอนุมัติแล้ว |
| `CANCELLED` | ยกเลิก |

Transition ที่ implement แล้ว:

- `DRAFT -> SUBMITTED`
- `SUBMITTED -> APPROVED` สำหรับ `EXPENSE`
- `SUBMITTED -> CLOSED` สำหรับ non-expense เช่น `REVENUE`
- `SUBMITTED -> REJECTED`
- `APPROVED -> PAID`
- หลาย Case -> `CLOSED` เมื่อถูกผูกเข้า JV

Transition ที่มีใน spec เดิมแต่ไม่ใช่ flow หลักปัจจุบัน:

- `PS_APPROVED`
- `CR_ISSUED`
- `SETTLEMENT_SUBMITTED`
- `DB_ISSUED`

## 18. Business Logic ที่ควรระวังหรือควรปรับต่อ

จุดที่ spec กับโค้ดปัจจุบันยังไม่ตรงกัน:

- Spec เดิมบอก dashboard/P&L ใช้ DB เป็น source of truth แต่โค้ดปัจจุบันใช้ PV/RV และ `Case.requested_amount`
- `Payment` model มีอยู่ แต่ `mark_paid` ยังไม่ได้สร้าง `Payment` record
- Endpoint `POST /api/v1/documents/jv` ยังไม่ได้ enforce RBAC
- `Profit & Loss` ใช้ `Case.requested_amount` ไม่ใช่ `Document.amount`
- `Dashboard` มี 2 endpoint ที่ logic ไม่เหมือนกัน: `/api/v1/documents` และ `/api/v1/dashboard`
- `REVENUE` approval ปัจจุบันเปลี่ยน status เป็น `CLOSED` ทันทีหลัง approve
- Category type `ASSET` ถูก map เป็น `JV` ตอน submit ถ้าถูกสร้างเป็น Case โดยตรง
- บาง endpoint file/list ยังมี comment ว่า validate access เพิ่มได้ แต่ยังไม่ได้ enforce ละเอียดเท่ากับ Case visibility

## 19. Business Flow สรุปแบบสั้น

### PV รายจ่าย

1. Requester สร้าง PV form
2. เลือก expense category
3. Upload ใบ ปส
4. ระบบสร้าง Case `DRAFT`
5. Submit แล้วระบบสร้างเลข `PV-YYMM-####` และ status `SUBMITTED`
6. Approver approve
7. ระบบ stamp PDF และ status เป็น `APPROVED`
8. Treasury mark paid แล้ว status เป็น `PAID`
9. Requester/ผู้เกี่ยวข้อง upload receipt
10. `is_receipt_uploaded = true`

### RV รายรับ

1. ผู้ใช้สร้าง RV form
2. เลือก revenue category
3. เลือก deposit account จาก category type `ASSET`
4. ระบบสร้าง Case `DRAFT`
5. Submit แล้วระบบสร้างเลข `RV-YYMM-####`
6. Approve แล้ว status เป็น `CLOSED`

### JV ปรับปรุงบัญชี

1. ผู้ใช้ค้นหาและ pull เอกสารที่เกี่ยวข้อง
2. เลือก main case
3. ระบบสร้างเลข `JV-YYMM-####`
4. ระบบสร้าง JV line items
5. ระบบ close ทุก Case ที่ถูก link
