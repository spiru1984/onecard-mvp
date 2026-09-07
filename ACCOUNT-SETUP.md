# Uruchomienie logowania i synchronizacji

Stan 7 września 2026: logowanie e-mailem i synchronizacja podłączone do Supabase (Free, Irlandia). SMTP Gmail i polskie kody rejestracji/logowania sprawdzone. SMS pozostaje wyłączony (smsEnabled: false), Twilio jeszcze niepodłączone. Budżet testu: maksymalnie 100 zł; nie dokonano zakupów.

## Konfiguracja właściciela

1. Utwórz projekt Supabase na swoim koncie, w regionie UE. Hasło bazy wprowadź bezpośrednio w panelu. Na początek rozważ plan Free; sprawdź aktualne limity i zasady usypiania projektu.
2. Uruchom `supabase-setup.sql` raz w SQL Editor. Dostęp do kart ogranicza RLS według `auth.uid()`. Klient anonimowy nie ma dostępu do tabeli. Sprawdź to z dwoma kontami przed włączeniem logowania dla testerów.
3. Auth: włącz Email i Phone. Ustaw Site URL na `https://spiru1984.github.io/onecard-mvp/`. Logowanie używa kodów, nie linków. Szablon e-maila Magic Link powinien zawierać `{{ .Token }}`; szablon potwierdzenia zmiany e-maila także. Nie zastępuj nim tokenu SMS.
4. Do normalnej wysyłki e-maili skonfiguruj własny SMTP. Domyślna usługa Supabase ogranicza adresatów i liczbę wiadomości. Najpierw przetestuj na dozwolonych adresach własnego zespołu. Nie traktuj domyślnej wysyłki jako gotowej dla dowolnych użytkowników.
5. W Twilio przygotuj nadawcę/usługę obsługiwaną przez integrację Supabase. Account SID, Auth Token i wymagane dane nadawcy wpisz WYŁĄCZNIE w konfiguracji Phone/SMS w Supabase. Nigdy w repozytorium ani w `config.js`. Konto próbne Twilio ma ograniczenia odbiorców. Sprawdź bieżące ceny dla krajów testerów, weryfikację nadawcy i wymagania rejestracyjne.
6. Przed aktywacją płatnej wysyłki ustal łączny limit 100 zł, wyłącz automatyczne doładowania, ogranicz kraje SMS do rzeczywistych testerów oraz ustaw limity OTP w Supabase i limity/alerty kosztów u dostawcy. Alert sam w sobie nie jest twardym limitem wydatków. Nie udostępniaj publicznie otwartej płatnej wysyłki bez zabezpieczenia przed nadużyciami (np. CAPTCHA z integracją po stronie klienta, której ten etap jeszcze nie zawiera).
7. Dopiero po konfiguracji i testach wpisz URL projektu oraz PUBLICZNY publishable key do `config.js`. Nie używaj service_role/secret key. Zmień wersję cache w service-worker.js przy publikacji konfiguracji.

## Konta i dane

- Obecnie dostępny jest e-mail. SMS wymaga uruchomienia Twilio i zmiany smsEnabled. Pierwsze potwierdzone logowanie tworzy konto.
- Aby używać obu metod na JEDNYM koncie, zaloguj się pierwszą metodą, kliknij „Dodaj telefon/e-mail do tego konta” i potwierdź drugi kontakt. Oddzielna rejestracja e-mailem i telefonem tworzy dwa konta. Aplikacja nie scala kont samowolnie.
- Dotychczasowe karty gościa pozostają w `onecard-cards-v1`. Po zalogowaniu używamy osobnego obszaru pamięci według identyfikatora konta. Przycisk kopiowania kart świadomie przesyła ich kody do chmury. Zdjęcia nigdy nie są przesyłane.
- Zapis karty i kolejki synchronizacji jest jedną operacją localStorage. Usuwanie zapisuje znacznik usunięcia, żeby inne urządzenie nie przywracało skasowanej karty. Dane serwera są łączone z niezakończonymi lokalnymi operacjami. Przy konflikcie tego samego rekordu wygrywa ostatni zapis przyjęty przez serwer; obecny interfejs nie edytuje istniejących kart.
- Wylogowanie przełącza na karty gościa; pamięć konta zostaje do następnego logowania na to samo konto. Urządzenie powinno być prywatne. Opróżnienie danych witryny kasuje kopie lokalne i niezakończone operacje.

## Warunki dopuszczenia testu online

- Potwierdzić dostarczenie kodu e-mail i SMS oraz odmowę błędnego/wygasłego kodu.
- Połączyć e-mail i telefon na jednym koncie i zalogować się obiema metodami.
- Na dwóch urządzeniach sprawdzić dodanie/usunięcie karty, tryb offline, powrót online i wylogowanie.
- Z JWT konta A spróbować odczytać i zmienić rekord konta B; baza ma odmówić. Bez JWT dostęp ma być zabroniony.
- Sprawdzić koszty, ograniczenia wysyłki i informację o przetwarzaniu danych przed zaproszeniem testerów.

Źródła: https://supabase.com/docs/guides/auth/auth-email-passwordless , https://supabase.com/docs/guides/auth/phone-login?showSmsProvider=Twilio , https://supabase.com/docs/guides/auth/auth-smtp , https://supabase.com/docs/guides/database/postgres/row-level-security .

## Weryfikacja 7 września 2026

Testy lokalne kodów, aparatu, importu zdjęć i offline przeszły. Prawdziwy kod e-mail zweryfikowano w interfejsie. Dwa izolowane konteksty przeglądarki z sesją tego samego konta potwierdziły synchronizację i zapis offline po powrocie internetu; wylogowanie ukryło karty konta. Test SQL na dwóch tymczasowych użytkownikach z rolą authenticated potwierdził izolację odczytu, blokadę zapisu cudzych kart i odmowę odczytu anon; cała transakcja została wycofana. Nie jest to test dwóch fizycznych telefonów. Dwie oznaczone karty testowe pozostały na koncie ONECARD.

