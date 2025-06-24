-- Добавление поля scraped_date_milan в таблицу tournament_snapshots
-- Это поле содержит дату по времени Милана для улучшенной проверки дубликатов

ALTER TABLE tournament_snapshots 
ADD COLUMN scraped_date_milan DATE COMMENT 'Дата сбора данных по времени Милана (Europe/Rome)';

-- Создание индекса для быстрой проверки дубликатов
CREATE INDEX idx_duplicates_milan ON tournament_snapshots (player_name, tournament_limit, points, scraped_date_milan);

-- Обновление существующих записей (если есть)
-- Преобразуем существующие timestamp в даты по времени Милана
UPDATE tournament_snapshots 
SET scraped_date_milan = DATE(CONVERT_TZ(scraped_at, '+00:00', '+01:00'))
WHERE scraped_date_milan IS NULL; 