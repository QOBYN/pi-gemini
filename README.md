# pi-gemini

Proxy server expose Google Gemini API (via OAuth) theo format Gemini REST API. Dùng để chạy Gemini thông qua Google account cá nhân thay vì API key trả phí.

## Yêu cầu

- Node.js 18+
- pnpm
- pm2 (chỉ cần khi deploy lên VPS)

---

## Chạy local

### 1. Cài dependencies

```bash
cd pi-gemini
pnpm install
```

### 2. Tạo file `.env`

```bash
cp .env.example .env
```

Chỉnh `.env` với các giá trị thực:

```env
PORT=3004

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

SECRET_KEY=any-random-string
SALT_KEY=another-random-string
ADMIN_KEY=your-admin-password

DEFAULT_MODEL=gemini-2.0-flash
```


> **Lấy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ở đâu?**

GOOGLE_CLIENT_ID=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com

GOOGLE_CLIENT_SECRET=<decoded_value>

Chạy trong terminal để decode value
```
echo "R09DU1BYLTR1SGdNUG0tMW83U2stZ2VWNkN1NWNsWEZzeGw=" | base64 -d
```

### 3. Chạy server

```bash
pnpm dev        # dev mode (auto-reload)
# hoặc
pnpm build && pnpm start   # production mode
```

Server chạy tại `http://localhost:3004`.

### 4. Đăng nhập Google

Mở `http://localhost:3004/admin`, đăng nhập bằng `ADMIN_KEY`, click **"Login with Google"**.

File `auth.json` sẽ được tạo tự động — đây là OAuth credentials, **không commit lên git**.

### 5. Tạo API key

Trong admin panel, tạo API key để dùng với các request.

### 6. Test

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

---

## Deploy lên VPS

### Yêu cầu trên VPS

```bash
# Cài pnpm và pm2 (chạy một lần)
npm install -g pnpm pm2
```

### 1. Tạo `.env` trên VPS (chỉ làm một lần)

```bash
ssh user@your-vps
mkdir -p ~/apps/pi-gemini
nano ~/apps/pi-gemini/.env
```

Paste nội dung `.env` giống như local (thay đổi `PORT` nếu cần).

### 2. Deploy

```bash
# Từ máy local
VPS=user@your-vps ./pi-gemini/deploy.sh

# Nếu SSH port khác 22
VPS=user@your-vps VPS_PORT=2222 ./pi-gemini/deploy.sh
```

Script sẽ tự động:
1. Build code
2. Upload lên VPS (không upload `.env`, `node_modules`, `auth.json`)
3. Install dependencies trên VPS
4. Restart service qua pm2

### 3. Đăng nhập Google trên VPS

Mở `http://your-vps:3004/admin` và đăng nhập Google lần đầu (tương tự local). File `auth.json` sẽ được lưu tại `~/apps/pi-gemini/auth.json` trên VPS.

### Các lần deploy tiếp theo

Chỉ cần chạy lại `deploy.sh` — `.env` và `auth.json` trên VPS được giữ nguyên.

---

## Unit tests

```bash
pnpm test          # unit tests
pnpm test:e2e      # e2e tests (MSW mock)
pnpm test:all      # tất cả
pnpm test:watch    # watch mode
```

Tests không cần `auth.json` hay Google credentials — network calls đều được mock.
