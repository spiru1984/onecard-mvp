# ONECARD

Prosty portfel kart lojalnościowych. Otwórz aplikację przez HTTPS, wybierz **Skanuj**, zezwól na aparat, zeskanuj cały kod i podaj nazwę sklepu. Zapisana karta zachowuje treść oraz format kodu. Można też dodać kartę ręcznie.

Obsługiwane formaty: Code 128, Code 39, EAN-13, EAN-8, UPC-A, QR, Data Matrix, Aztec i PDF417. Stare karty bez pola `format` pozostają w Code 128. Kody dynamiczne nie odświeżają się — dla takich kart używaj aplikacji sklepu.

Po komunikacie „Gotowe offline” można ponownie otwierać aplikację i dodawać lub pokazywać karty bez internetu. Dane są przechowywane wyłącznie w localStorage tej przeglądarki. Usunięcie danych witryny usuwa karty; nie ma synchronizacji ani kopii w chmurze. Zwiększ jasność ekranu przy kasie, a długi kod pokaż poziomo.

## Rozwój i testowanie

Statyczna aplikacja bez kompilacji. Uruchom serwer HTTP w katalogu repozytorium, np. `python -m http.server 4173 --bind 127.0.0.1`, i otwórz `http://127.0.0.1:4173`. Aparat działa na localhost lub HTTPS.

Testy akceptacyjne: `npm install`, `npx playwright install chromium`, następnie przy działającym serwerze `npm test`. Opcjonalnie `BROWSER_CHANNEL=msedge` używa zainstalowanego Edge. Testy używają osobnego profilu i sztucznego obrazu przesyłanego jako strumień kamery; nie korzystają z prywatnych kart ani fizycznego aparatu.

Zakres: odczyt zwrotny dziewięciu formatów, dokładne dane i zera wiodące, zapis/odczyt offline, niewłaściwa cyfra kontrolna, odmowa aparatu, zamknięcie przed udzieleniem zgody, zatrzymanie ścieżek, zgodność ze starymi kartami i zachowanie uszkodzonej pamięci. Ostateczny test optyczny wymaga telefonu i czytnika sklepu.

## Biblioteki

Pliki bibliotek są lokalne i objęte cache offline, bez żądań do CDN:
- @zxing/browser 0.1.5 (MIT), zawiera @zxing/library (Apache-2.0): https://github.com/zxing-js/browser
- bwip-js 4.7.0 (MIT), w tym Barcode Writer in Pure PostScript: https://github.com/metafloor/bwip-js

Licencje znajdują się w plikach `*-LICENSE`. Wersja wyjściowa repozytorium: `03389aa110820770b12c694090e37ef468bdc0b5`.
