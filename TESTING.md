# Hướng dẫn Setup & Test pi-gemini

## 1. Cài dependencies

```bash
cd pi-gemini
npm install
```

## 2. Cấu hình môi trường

Copy và chỉnh `.env`:
```bash
cp .env.example .env
```

Nội dung `.env` tối thiểu để chạy server:
```env
PORT=3004
AUTH_FILE=auth.json          # path đến file OAuth credentials
SECRET_KEY=your-secret-key   # dùng để generate API keys
SALT_KEY=your-salt-key       # dùng để hash stored keys
ADMIN_KEY=your-admin-key     # password cho admin panel
DEFAULT_MODEL=gemini-2.0-flash
```

## 3. Đăng nhập Google OAuth

Khởi động server:
```bash
npm run dev
```

Mở admin panel tại `http://localhost:3004/admin`, đăng nhập bằng `ADMIN_KEY`, rồi click **"Login with Google"** để lấy OAuth credentials. File `auth.json` sẽ được tạo tự động.

## 4. Chạy tests

### Unit tests (không cần server, không cần internet)
```bash
npm test
```

### E2E tests (MSW mock network, không cần server thật)
```bash
npm run test:e2e
```

### Tất cả tests
```bash
npm run test:all
```

### Watch mode (khi đang develop)
```bash
npm run test:watch
```

## 5. Smoke test thủ công

Tạo API key qua admin panel, sau đó:

```bash
# Non-streaming
curl -s -X POST http://localhost:3004/v1beta/models/gemini-2.0-flash:generateContent \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say hello"}]}]}' | python3 -m json.tool

# Streaming
curl -sN -X POST http://localhost:3004/v1beta/models/gemini-2.0-flash:streamGenerateContent \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say hello"}]}]}'
```

## Lưu ý

- Tests **không cần** `auth.json` hay Google credentials — network calls đều được MSW mock
- Tests **không đọc/ghi** file thật — file I/O được mock trong unit tests, E2E dùng temp files trong `/tmp/`
- Warning `--localstorage-file` khi chạy E2E là bình thường, không ảnh hưởng kết quả
