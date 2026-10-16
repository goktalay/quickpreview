# Quick Preview

Windows Gezgini'nde bir dosyaya sağ tıklayıp **Hızlı Önizleme**'yi seçince dosyayı anında gösteren küçük araç. Resim resim olarak, Photoshop dosyası resim olarak, PDF sayfa sayfa resim olarak görünür; metin, kod, Markdown, Office belgeleri, video, ses ve ZIP arşivleri de önizlenir. Uygulama tepside bekler; tepsi simgesi istenirse gizlenir.

Mastertool ailesinin **Araçlar** grubundandır (uygulama kodu `qp`). Kendi sitesi yoktur: tanıtım [mastertool.download/araclar/quick-preview](https://mastertool.download/araclar/quick-preview), indirme Mastertool **Hesabım** sayfasından ve **Master Tool** masaüstü uygulamasından.

## İndirme

- `Quick-Preview-Setup-x.y.z.exe`: kurulum (`Program Files\Mastertool\Quick Preview`, Başlat menüsünde Master Tool › Quick Preview). Gezgin sağ tık kaydını yazar, kaldırınca siler.
- `Quick-Preview-Portable-x.y.z.exe`: kurulumsuz, tek dosya. Sağ tık kaydını ilk açılışta kendisi yazar (Ayarlar › Genel'den kapatılabilir).

## Özellikler

- **Sağ tık menüsü:** `HKCU\Software\Classes\*\shell\MastertoolQuickPreview` → "Hızlı Önizleme" (uygulamanın dilinde, 8 dil). Yalnız dosyalarda görünür, klasörlerde görünmez. Yönetici izni gerekmez. Windows 11'de "Daha fazla seçenek göster" altındadır (bkz. [Bilinen sınırlar](docs/site-teknik.md#bilinen-sınırlar)).
- **Hız:** uygulama tepside bekler ve önizleme penceresini önceden yükleyip gizli tutar. Sağ tıktan başlayan yeni süreç tek örnek kilidini alamayınca dosya yolunu bekleyen sürece iletir ve hiçbir şey yüklemeden kapanır; pencere anında görünür. Kapatınca (Esc / Space) pencere gizlenir, yok edilmez.
- **Önizlenen türler** (Ayarlar › Önizleme'de tek tek kapatılabilir; kapalı ya da tanınmayan türde dosya bilgisi — boyut, tarih, tür — gösterilir):
  - **Resimler:** JPG, PNG, GIF, WebP, BMP, ICO/CUR, AVIF (Chromium), TIFF (UTIF.js, çok sayfalı), HEIC/HEIF (libheif, WebAssembly).
  - **Photoshop PSD/PSB** (ag-psd): dosyadaki düzleştirilmiş birleşik görüntü; "Uyumluluğu en üst düzeye çıkar" kapalı kaydedilmişse görünür katmanlardan yaklaşık görüntü. Bilgi panelinde renk modu, bit derinliği, çözünürlük ve isteğe bağlı katman listesi (gruplar, gizli katmanlar, opaklık).
  - **PDF** (pdf.js): sayfa sayfa resim görünümü, solda küçük resim şeridi, PgUp/PgDn ile sayfa, başlık/yazar/üretici bilgisi. Parola korumalı PDF'de bilgi.
  - **SVG:** resim olarak (`<img>` içinde; betik çalışmaz) ya da kaynak kodu.
  - **Metin ve kod:** highlight.js ile söz dizimi renkli, salt okunur, satır numaralı; kodlama algılama (UTF-8/BOM, UTF-16, Windows-1254); büyük dosyalarda ilk 2 MB.
  - **Markdown:** biçimli görünüm, içindekiler paneli, kaynak görünümü. Ham HTML çalıştırılmaz, uzak resimler yüklenmez, bağlantılar tarayıcıda açılır.
  - **Video ve ses:** HTML5 oynatıcı (MP4, WebM, MOV, MKV, OGG, MP3, WAV, FLAC, M4A, AAC, Opus — Chromium'un çözebildiği kodekler).
  - **Office:** Word (paragraflar, başlıklar, listeler, tablolar), Excel (sayfalar ve hücreler; tarih biçimli hücreler tarih olarak), PowerPoint (slayt başlıkları, maddeler, konuşmacı notları). Office kurulu olmak zorunda değil.
  - **Arşiv:** ZIP (ve JAR, EPUB, ODT gibi ZIP tabanlılar) içerik listesi: ad, boyut, sıkıştırılmış boyut, tarih, şifreli girdiler, arama. Yalnız merkez dizin okunur; çok büyük arşivler de anında listelenir.
- **Önizleme penceresi:** yakınlaştır / uzaklaştır (Ctrl+tekerlek imlecin olduğu noktaya), sığdır, gerçek boyut, 90° döndür, sürükleyerek kaydırma, çift tıkla sığdır ↔ %100; ← / → ile aynı klasördeki önceki/sonraki dosya (Gezgin gibi doğal sıralama); Esc / Space kapatır; Enter "Varsayılan uygulamayla aç"; "Klasörde göster"; dosya bilgisi paneli (I); tam ekran (F / F11); Gece / Gündüz düğmesi.
- **Tepsi:** simge menüsünde *Dosya önizle…*, *Ayarlar*, *Gizle (simgeyi kaldır)*, *Çıkış*. Gizlenince uygulama arka planda sağ tık isteklerini karşılamaya devam eder; simge Ayarlar › Genel'den ya da uygulamayı yeniden çalıştırınca (Başlat menüsü) geri gelir.
- **Windows ile başlat:** varsayılan açık; uygulama `--hidden` ile tepside sessizce başlar, ilk sağ tık önizlemesi de anında açılır.
- **Ayarlar** (Mastertool ortak iskeleti; sağ üstte Mastertool düğmesi): **Genel** (dil, tema Gece/Gündüz/Sistem — varsayılan Sistem, Windows ile başlat, tepsi simgesi, sağ tık kaydı ve durumu, güncelleme denetimi, çıkış), **Hesap**, **Önizleme** (türler, açılışta yakınlaştırma, PSD katman listesi, bilgi paneli, satır kaydırma, otomatik oynatma, kısayollar), **Hakkında** (sürüm, güncelleme denetimi, tanıtım sayfası, açık kaynak lisansları).
- **Mastertool hesabı:** uygulama hesapsız çalışmaz. İlk açılışta giriş istenir; başka bir Mastertool uygulamasında giriş yapılmışsa ortak oturumla şifresiz açılır. Girişsizken sağ tıkla istenen dosya bekletilir, giriş ekranı "Önizleme için Mastertool hesabınızla giriş yapın" der ve girişten sonra dosya açılır.
- **Ortak oturum (SSO):** [goktalay/mastertool](https://github.com/goktalay/mastertool) `src/sso.js` ile birebir aynı: Windows Kimlik Bilgisi Yöneticisi'nde `Mastertool` / `sso`, durum `%APPDATA%\Mastertool\sso-state.json`. Birinde çıkış yapınca hepsinden çıkılır.
- **Uçtan uca şifreli ayar senkronu:** yalnız ayarlar (tema, dil, önizleme ayarları) AES-256-GCM ile şifrelenip hesaba yedeklenir; anahtar `HKDF(master, info="qpv-enc-v1")`. Cihaza özgü ayarlar (Windows ile başlat, tepsi, sağ tık kaydı, pencere boyutu) gönderilmez.
- **Gizlilik:** her şey yerel. Dosyalar, dosya adları ve içerikleri hiçbir yere gönderilmez; önizleme penceresinin içerik güvenlik politikası ağ adreslerine izin vermez.

## Yerel veri

`%APPDATA%\Quick Preview\`:

| Yol | İçerik |
|---|---|
| `store.json` | ayarlar ve senkron meta verisi |
| `account.json` | cihaz kimliği, e-posta; "Beni hatırla" açıksa DPAPI ile şifreli oturum ve anahtar |

## Geliştirme

```bash
npm install
npm start                          # electron .
npm start -- --preview C:\yol\dosya.psd
npm test                           # node --test (tür algılama, PSD/PDF/resim, Office/ZIP, tek örnek, sağ tık, SSO, hesap, i18n, ana süreç)
npm run icon                       # build/icon.svg → icon.png + icon.ico
npm run samples                    # örnek dosyalar (samples/, git'e girmez)
npm run screenshots                # docs/screenshots (tr) ve docs/screenshots/en (Chromium: CHROMIUM_PATH)
npm run dist                       # Windows: kurulum + portable (dist/)
```

Sunucu adresi `QP_API` ortam değişkeniyle değiştirilebilir (varsayılan `https://mastertool.download`).

## Yayın

GitHub Actions (`.github/workflows/release.yml`): `v1.2.3` etiketi ya da Actions'tan elle çalıştırma (sürüm girilirse yayın). Windows'ta derler, testleri çalıştırır, exe'leri Release'e ekler ve `scripts/upload-quickpreview.sh` ile mastertool.download'a yükler: `POST /api/qp/releases/<sürüm>/setup`, sonra `/portable` (≤ 90 MB parçalar, `X-Release-Key` = depo secret'ı `QUICKPREVIEW_RELEASE_KEY`). Uygulama yeni sürümü `GET /api/qp/releases/latest` ile denetler.

Teknik ayrıntılar: [docs/site-teknik.md](docs/site-teknik.md).
