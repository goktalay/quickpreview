# Quick Preview — teknik föy

Bu föy kaynak koddan doğrulanmıştır (dal `claude/quick-preview-init`, sürüm 1.0.0). Tanıtım sayfası (mastertool.download/araclar/quick-preview) için kaynak metindir; sayfadaki her teknik iddia buradaki bir maddeye dayanmalıdır.

## Kimlik

| | |
|---|---|
| Ürün | Quick Preview — Mastertool ailesi › **Araçlar** (kendi sitesi yok) |
| Uygulama kodu | `qp` (sunucu uçları `/api/qp/*`) |
| Platform | Windows 10 / 11, x64 |
| Çatı | Electron 33 (Chromium 130, Node.js 20) |
| Paketler | `Quick-Preview-Setup-<sürüm>.exe` (NSIS), `Quick-Preview-Portable-<sürüm>.exe` |
| Kurulum yeri | tüm kullanıcılar: `C:\Program Files\Mastertool\Quick Preview`; yalnız bu kullanıcı: `%LOCALAPPDATA%\Programs\Mastertool\Quick Preview` |
| Başlat menüsü | `Master Tool › Quick Preview` |
| Simge | mastertool.download/brand/qp-512.png ve qp.svg ile birebir aynı (`build/icon.png`, `build/icon.svg`) |
| Diller | Türkçe, English, Français, Deutsch, Español, العربية (sağdan sola), 中文, Русский |
| Tema | Gece / Gündüz / Sistem (varsayılan Sistem) |

## Gezgin sağ tık menüsü

Kayıt (`src/shellmenu.js`, `build/installer.nsh`):

```
HKCU\Software\Classes\*\shell\MastertoolQuickPreview
    MUIVerb = Hızlı Önizleme          (uygulamanın dili)
    Icon    = "<exe>",0
HKCU\Software\Classes\*\shell\MastertoolQuickPreview\command
    (Varsayılan) = "<exe>" --preview "%1"
```

- Yalnız dosyalar (`*`) için kayıtlıdır; klasörlerde (`Directory`) görünmez.
- Kullanıcı kapsamındadır (HKCU); yönetici izni gerekmez.
- Etiket 8 dilde: Hızlı Önizleme · Quick Preview · Aperçu rapide · Schnellvorschau · Vista previa rápida · معاينة سريعة · 快速预览 · Быстрый просмотр. Kurulum, kurulum dilindeki etiketi yazar; uygulama her açılışta ve dil değişince kaydı kendi exe yoluna ve seçili dile göre doğrular (`reg.exe`).
- Kaldırma kaydı siler (yükseltme sırasında çalışan eski kaldırıcı silmez; yeni kurulum yeniden yazar). Kaldırma, "Windows ile başlat" kaydını (`HKCU\…\Run\MastertoolQuickPreview`) da siler.
- Taşınabilir sürüm kaydı ilk açılışta kendi exe'sine (`PORTABLE_EXECUTABLE_FILE`) yazar; Ayarlar › Genel'den kapatılabilir (kapatınca kayıt yalnız bu exe'ye aitse silinir). Ayarlar kaydın durumunu gösterir: kayıtlı / kayıtlı değil / başka bir kopyayı gösteriyor.
- Geliştirme modunda (`electron .`) kayıt yapılmaz.

## Hız: tek örnek ve önceden hazırlanmış pencere

- `src/instance.js`: süreç her şeyden önce tek örnek kilidini ister (`requestSingleInstanceLock`). Kilidi alamayan ikinci süreç (sağ tıktan başlayan) isteğini kilit verisiyle iletir — `{ qp: 1, preview, hidden, settings }` — ve başka hiçbir modül yüklemeden `app.exit(0)` ile kapanır. Kilit verisi kullanılır, çünkü Chromium ikinci örneğin komut satırına kendi anahtarlarını ekleyebilir; veri yoksa (eski sürüm) komut satırı çözülür.
- Bekleyen örnekte önizleme penceresi girişten hemen sonra oluşturulur, sayfası yüklenir ve gizli bekler (`show: false`). İstek gelince içerik gönderilir ve pencere imlecin bulunduğu ekranda ortalanarak gösterilir; Windows ön plan kilidine karşı kısa süre "her zaman üstte" yapılır.
- Kapatma (Esc, Space, ✕) pencereyi gizler, yok etmez; içerik temizlenir (oynatıcı durur, PDF belgesi kapanır).
- Dosya okuma ve çözme önizleme penceresinin preload'unda (renderer süreci) yapılır; ana süreç (tepsi, istek iletimi) hiç beklemez.
- Pencere boyutu hatırlanır; ilk açılışta çalışma alanının %72 × %80'i (en az 640 × 420).

## Desteklenen türler

Tür önce içerik imzasından, sonra uzantıdan belirlenir (`src/preview/detect.js`); uzantısı yanlış ya da hiç olmayan dosyalar da doğru gösterilir. İmzalar: PNG, JPEG, GIF, WebP, BMP, ICO/CUR, TIFF (II/MM), PSD/PSB (`8BPS`), PDF (`%PDF-`), ISO-BMFF (`ftyp`: HEIC/HEIF/AVIF/MP4/MOV/M4A), Matroska/WebM, Ogg, FLAC, MP3 (ID3/çerçeve), RIFF (WAVE/AVI), ZIP (`PK`). İmzası olmayan metin: NUL bayt yoksa ve kontrol karakteri < %2 ise metin; içerik `<svg` ile başlıyorsa SVG.

| Tür | Görünüm | Ayrıntı |
|---|---|---|
| Resim (JPG, PNG, GIF, WebP, BMP, ICO, AVIF) | Chromium `<img>` | yakınlaştırma, döndürme, saydamlık için dama zemin, %300 üstünde piksel keskin |
| TIFF | UTIF.js → tuval | çok sayfalı dosyada ilk sayfa, sayfa sayısı bilgide |
| HEIC / HEIF | libheif (WebAssembly) → tuval | iPhone fotoğrafları |
| Photoshop PSD / PSB | ag-psd → tuval | dosyadaki birleşik görüntü; yoksa ya da düz/tek renkse görünür katmanlar normal karışım + opaklıkla birleştirilir (yaklaşık; karışım modları ve efektler yok sayılır, bilgide uyarı). Bilgi: renk modu, bit derinliği, çözünürlük, katman sayısı; isteğe bağlı katman listesi (üstten alta, gruplar girintili, gizli katmanlar çizili, opaklık %) |
| PDF | pdf.js (Web Worker) | sayfa sayfa resim görünümü, küçük resim şeridi (görününce çizilir, en çok 2000 sayfa), %100 = ekranda gerçek boyut (96/72), yakınlaştırınca sayfa yeniden çizilir (tuval en çok 24 MP). Başlık, yazar, üretici, PDF sürümü. Karakter eşlemleri ve standart yazı tipleri paketten okunur (ağ yok). Parola korumalı PDF'de bilgi kartı |
| SVG | `<img>` (data URL) ya da kaynak | betik çalışmaz, dış kaynak yüklenmez; vektör olduğu için sığdırırken büyütülür |
| Metin ve kod | highlight.js | 58 dil (highlight.js "common" + uzantı tablosundaki ek diller); uzantısız bilinen adlar (Dockerfile, Makefile, .gitignore, .env…). Kodlama: BOM, UTF-8, UTF-16 LE/BE, aksi halde Windows-1254. İlk 2 MB gösterilir; 512 KB üstü renklendirilmez; dili bilinmeyen ≤ 64 KB dosyada otomatik dil algılama. Satır numaraları, satır kaydırma (W), yazı boyutu |
| Markdown | marked (GFM) | biçimli görünüm + kaynak; başlıklardan içindekiler (≥ 3 başlıkta yan panel). Ham HTML metin olarak gösterilir; bağlantılar yalnız http/https/mailto/# ve tarayıcıda açılır; yalnız yerel (dosyaya göre göreli) ve data: resimler gösterilir, uzak resimler yüklenmez |
| Video / ses | HTML5 `<video>` / `<audio>` | MP4, M4V, MOV, WebM, MKV, OGV, MP3, WAV, OGG, Opus, FLAC, M4A, AAC; oynatılamayan kodekte bilgi kartı. Süre ve çözünürlük bilgide. Otomatik oynatma ayarlanabilir |
| Word (docx, docm) | metin görünümü | başlık, Başlık 1–6 (ve yerelleştirilmiş adları), madde işaretli/numaralı paragraflar, tablolar; belge özellikleri (başlık, yazar, son değiştiren, sayfa sayısı). En çok 4000 paragraf |
| Excel (xlsx, xlsm) | tablo | sayfa sekmeleri (en çok 30), paylaşılan / satır içi metinler, sayılar, mantıksal değerler, tarih biçimli hücreler tarih olarak (1900/1904 sistemi); en çok 500 satır × 60 sütun. Formüllerin kayıtlı sonucu gösterilir |
| PowerPoint (pptx, pptm) | slayt kartları | sunumdaki sırayla slayt başlığı, maddeler (girinti düzeyi), tablolar, konuşmacı notları; en çok 300 slayt |
| Arşiv (zip, jar, apk, epub, odt…) | liste | yalnız merkez dizin okunur (ZIP64, UTF-8 ve eski CP437 adlar); ad, boyut, sıkıştırılmış boyut, tarih, şifreli girdi işareti, arama; ilk 5000 girdi gösterilir |
| Tanınmayan / kapalı tür | bilgi kartı | boyut (bayt), değiştirilme ve oluşturulma tarihi, tür; "Varsayılan uygulamayla aç" ve "Klasörde göster" |

PSD, TIFF, HEIC ve PDF önizleme için belleğe alınır; 1,5 GB'tan büyük dosyalarda bilgi kartı gösterilir. Office XML parçaları en çok 48 MB okunur.

## Önizleme penceresi

- Üst çubuk: tür simgesi, dosya adı, alt satırda tür · boyutlar / sayfa / süre / satır · dosya boyutu · klasördeki sıra (ör. 3 / 27). Türe göre araçlar: yakınlaştır − % +, sığdır, gerçek boyut, döndür; PDF'de sayfa; metinde satır kaydırma ve yazı boyutu; Markdown ve SVG'de görünüm / kaynak. Sağda: varsayılan uygulamayla aç, klasörde göster, bilgi paneli, Gece/Gündüz, kapat.
- Yakınlaştırma %2–%3200; sığdır (resimde küçük resmi büyütmez), Ctrl+tekerlek imlecin olduğu noktaya, sürükleyerek kaydırma, çift tık sığdır ↔ %100.
- Kısayollar: ← / → önceki/sonraki dosya (Arapçada yönler ters), Esc / Space kapat, + / − ve Ctrl + / − yakınlaştır, 0 sığdır, 1 gerçek boyut, R döndür, PgUp / PgDn sayfa (PDF) ya da sayfa sekmesi (Excel), Home / End ilk/son sayfa, I bilgi paneli, W satır kaydırma, Enter varsayılan uygulamayla aç, F / F11 tam ekran, fare geri/ileri düğmeleri önceki/sonraki dosya.
- Aynı klasördeki dosyalar Gezgin gibi doğal sıralanır ("resim2" < "resim10"); gizli (nokta ile başlayan), `desktop.ini` ve `Thumbs.db` atlanır.
- Bilgi paneli: tür, boyut (bayt olarak da), boyutlar, sayfa, süre, kodlama, satır, dil, değiştirilme, oluşturulma, salt okunur, konum (kopyala), türe özgü ayrıntılar (PSD, PDF, Office, arşiv), PSD katman listesi.

## Tepsi ve başlangıç

- Tepsi menüsü: Dosya önizle… · Ayarlar · Gizle (simgeyi kaldır) · Çıkış. Simgeye tıklamak Ayarlar'ı açar.
- **Gizle**: simge kalkar, uygulama arka planda sağ tık isteklerini karşılamaya devam eder (ilk seferde bildirim). Geri getirmek: Ayarlar › Genel › "Tepsi simgesini göster" ya da uygulamayı yeniden çalıştırmak (yeniden çalıştırınca simge geri gelir ve Ayarlar açılır).
- **Windows ile başlat** varsayılan açıktır: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` → `MastertoolQuickPreview` = `"<exe>" --hidden` (yalnız paketlenmiş uygulamada). `--hidden` ile pencere açılmaz, uygulama tepside bekler.
- Pencereler kapansa da uygulama çalışır; çıkış yalnız tepsideki "Çıkış" ya da Ayarlar › Genel › "Quick Preview'dan çık" ile. Giriş yapılmamışken giriş ekranı kapatılırsa uygulama kapanır (sağ tık yeniden başlatır).

## Ayarlar

Mastertool ortak iskeleti: üstte marka ve sağ üstte Mastertool düğmesi (mastertool.download'u uygulamanın dili ve temasıyla açar), solda sekmeler. Değişiklikler anında uygulanır.

| Sekme | Ayar | Varsayılan | Senkron |
|---|---|---|---|
| Genel | Dil | sistem dili (desteklenmiyorsa English) | evet |
| Genel | Tema: Gece / Gündüz / Sistem | Sistem | evet |
| Genel | Windows oturumu açılınca başlat | açık | hayır |
| Genel | Tepsi simgesini göster | açık | hayır |
| Genel | Sağ tık menüsüne "Hızlı Önizleme" ekle | açık | hayır |
| Genel | Açılışta yeni sürümü denetle | açık | hayır |
| Önizleme | Türler: resim, PSD, PDF, SVG, metin ve kod, Markdown, video ve ses, Office, arşiv | hepsi açık | evet |
| Önizleme | Açılışta yakınlaştırma: Sığdır / Gerçek boyut | Sığdır | evet |
| Önizleme | PSD katman listesi | açık | evet |
| Önizleme | Dosya bilgisi paneli | kapalı | evet |
| Önizleme | Metinde satır kaydırma | kapalı | evet |
| Önizleme | Video ve ses açılınca oynat | açık | evet |

Hesap sekmesi: oturum açan e-posta, senkron aç/kapat, şimdi senkronize et, sunucu kopyasını sil, Hesabım (web), çıkış. Hakkında: sürüm (taşınabilirse belirtilir), güncelleme denetimi, tanıtım sayfası, açık kaynak lisansları, Chromium lisansları.

İlk girişten sonra Ayarlar bir kez karşılama kartıyla açılır ("Bir dosya seçip dene").

## Mastertool hesabı, ortak oturum ve senkron

- Uygulama hesapsız çalışmaz. Girişsizken sağ tıkla istenen dosya bekletilir; giriş ekranı "Önizleme için Mastertool hesabınızla giriş yapın" der, girişten sonra dosya açılır.
- Sunucu: `https://mastertool.download` (`QP_API` ile değiştirilebilir). Kullanılan uçlar: `POST /api/qp/auth/prelogin`, `POST /api/qp/auth/login` (`{ email, auth_hash, device, app_version, sso: true }`), `POST /api/qp/auth/sso`, `POST /api/qp/auth/logout`, `GET /api/qp/me`, `GET|PUT|DELETE /api/qp/library`, `PUT /api/qp/settings` (senkron aç/kapat), `GET /api/qp/releases/latest`. Web sayfaları: `/kayit`, `/sifremi-unuttum`, `/hesabim`, `/araclar/quick-preview` (`?lang=…&theme=…&app=qp`).
- Şifre sunucuya gönderilmez: `master = PBKDF2-SHA256(şifre, salt, iter)`, `authHash = PBKDF2(master, şifre, 1)` gönderilir. 401 `session_expired` tüm aileyi kapatır; 403 `app_disabled` / `wrong_app` yalnız bu uygulamayı.
- Ortak oturum (SSO): `src/sso.js`, goktalay/mastertool `main` ile birebir. Windows Kimlik Bilgisi Yöneticisi `Mastertool` / `sso` (≤ 1200 karakter), durum dosyası `%APPDATA%\Mastertool\sso-state.json` (`gen`, `in`/`out`), değişiklik `fs.watch` + 5 sn yoklama. Herhangi bir Mastertool uygulamasında giriş yapılmışsa şifre sorulmaz; birinde çıkış yapınca hepsinden çıkılır.
- Senkron yalnız ayarları kapsar: `encKey = HKDF-SHA256(master, info = "qpv-enc-v1")`, AES-256-GCM; kütüphane `{ schema: 1, items: [{ id: "settings", data: { appTheme, language, preview } }] }`, en çok 256 KB. Değişiklikten 3 sn sonra ve 5 dakikada bir. Yeni cihazda hesaptaki ayarlar kazanır. Önizlenen dosyalar, adları ve yolları hiçbir zaman gönderilmez.
- "Beni hatırla" ile oturum ve anahtar Windows DPAPI (Electron `safeStorage`) ile şifreli saklanır.

## Gizlilik ve güvenlik

- Önizleme tamamen yereldir; dosya içeriği hiçbir sunucuya gönderilmez.
- Önizleme sayfasının içerik güvenlik politikası (CSP) ağ adreslerine izin vermez: `default-src 'self'`, resim/ortam yalnız `file:`, `data:`, `blob:`.
- Pencereler `contextIsolation` açık, `nodeIntegration` kapalı çalışır. Önizleme penceresinin preload'u dosyaları çözebilmek için korumalı alan (sandbox) dışındadır; sayfa yalnız hazır tanımı alır. Önizlemeye özgü IPC çağrıları yalnız önizleme penceresinden kabul edilir.
- Markdown'daki ham HTML çalıştırılmaz, `javascript:` gibi bağlantılar düz metne çevrilir; SVG `<img>` içinde gösterildiği için betik çalışmaz.
- Sayfa içinde gezinme engellidir; yeni pencere istekleri yalnız http/https ise tarayıcıda açılır.

## Yerel veri

`%APPDATA%\Quick Preview\store.json` (ayarlar, senkron meta verisi, son sağ tık kaydı, pencere boyutu) ve `account.json` (cihaz kimliği, e-posta; "Beni hatırla" açıksa DPAPI ile şifreli oturum). Ortak: `%APPDATA%\Mastertool\sso-state.json`.

## Sürüm yayını

GitHub Actions (`windows-latest`, Node 20): `npm ci`, `npm test`, `electron-builder --win` (kurulum + taşınabilir), GitHub Release, ardından `scripts/upload-quickpreview.sh`: `POST /api/qp/releases/<sürüm>/setup` (zorunlu), sonra `/portable`; dosyalar ≤ 90 MB parçalar halinde, başlık `X-Release-Key` (depo secret'ı `QUICKPREVIEW_RELEASE_KEY`), 409 zaten yüklü sayılır, sunucunun bildirdiği sha256 doğrulanır. Uygulama açılışta `GET /api/qp/releases/latest` ile yeni sürümü denetler ve bildirim gösterir (indirme Master Tool ya da Hesabım).

## Testler

`npm test` (Node yerleşik test koşucusu): tür algılama (imza/uzantı), ZIP okuyucu ve Office (docx/xlsx/pptx), PSD (birleşik görüntü, katmanlardan yaklaşık görüntü, katman listesi), TIFF, PDF (pdf.js: sayfa sayısı, boyut, üst veri), önizleme yükleyicisi (her tür, kapalı tür, bozuk dosya), metin kodlamaları ve Markdown güvenliği, tek örnek iletimi, sağ tık kayıt yolları ve `reg.exe` akışı, SSO, hesap ve ayar senkronu, i18n (8 dil eşliği; sağ tık etiketi installer.nsh ile aynı), ana süreç akışları (sahte Electron ile: girişsiz bekletme, giriş, önizleme penceresi, Gizle, ikinci örnek, çıkış).

## Bilinen sınırlar

- **Windows 11'in yeni (kısa) sağ tık menüsü.** Klasik kayıt (HKCU `shell` fiili) Windows 11'de yeni menüde değil, "Daha fazla seçenek göster" altında (ya da Shift+sağ tık / Shift+F10 ile doğrudan) görünür. Yeni menüye girmek için uygulamanın **paket kimliği** olmalı: `IExplorerCommand` uygulayan bir COM sunucusu ve AppxManifest'te `windows.fileExplorerContextMenus` uzantısı, imzalı bir MSIX ya da harici konumlu "sparse package" ile. Bu imzalama bir **kod imzalama sertifikası** gerektirir ve henüz yoktur. Kodda yeri ayrılmıştır: `src/shellmenu.js` › `MODERN_MENU` (`available: false`, `reason: 'needs_signed_msix'`); `status()` / `register()` / `unregister()` arayüzü aynı kalacak, yalnız strateji değişecek. Sertifika gelince klasik kayıt Windows 10 için korunur.
- **Kod imzası yok:** ilk indirmede Windows SmartScreen uyarı gösterebilir.
- **Birden çok dosya seçiliyken** Gezgin komutu her dosya için ayrı çalıştırır; önizleme son gelen dosyayı gösterir, diğerlerine ← / → ile geçilir.
- **Kaldırma** yalnız kaldıran kullanıcının sağ tık kaydını siler; uygulamayı çalıştırmış diğer Windows kullanıcılarının kayıtları kalır (exe olmadığı için çalışmaz).
- **Office önizlemesi** biçimlendirme, resim ve grafik göstermez; metin, başlık, liste ve tablo içindir. Eski ikili biçimler (doc, xls, ppt) ve RAR / 7z arşivleri desteklenmez (dosya bilgisi gösterilir).
- **PSD:** birleşik görüntü yoksa karışım modları, efektler, ayarlama katmanları ve maskeler yaklaşık görüntüde yok sayılır.
- **Video / ses:** Chromium'un çözemediği kodekler (ör. HEVC/H.265 video, bazı AVI kodekleri) oynatılamaz; varsayılan uygulamayla açma önerilir.
- **HEIC** çözme WebAssembly ile yapılır; çok büyük fotoğraflarda birkaç saniye sürebilir.
