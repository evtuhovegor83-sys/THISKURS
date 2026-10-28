USE BiteGoDB;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Addons' AND COLUMN_NAME = 'CategoryId')
BEGIN
    ALTER TABLE Addons ADD CategoryId INT NULL FOREIGN KEY REFERENCES Categories(Id);
END
GO

-- Обновляем существующие допы
-- Сыр Чеддер -> Пицца и Бургеры (оставим для Пиццы и добавим для Бургеров)
UPDATE Addons SET CategoryId = 1 WHERE Id IN (1, 2, 3, 4, 5, 6);
UPDATE Addons SET CategoryId = 3 WHERE Id = 7; -- Соус Унаги для роллов

-- Добавляем допы для бургеров (CategoryId = 2)
IF NOT EXISTS (SELECT 1 FROM Addons WHERE Name = 'Сыр Чеддер для бургера')
BEGIN
    INSERT INTO Addons (CategoryId, Name, Price, IsActive) VALUES
    (2, N'Дополнительный сыр Чеддер', 55.00, 1),
    (2, N'Хрустящий жареный бекон', 75.00, 1),
    (2, N'Острый перец халапеньо', 45.00, 1),
    (2, N'Соус Сырный Heinz', 40.00, 1),
    (2, N'Соус Барбекю Heinz', 40.00, 1),
    (2, N'Карамелизированный лук', 40.00, 1);
END

-- Добавляем допы для роллов (CategoryId = 3)
IF NOT EXISTS (SELECT 1 FROM Addons WHERE Name = N'Острый соус Спайси')
BEGIN
    INSERT INTO Addons (CategoryId, Name, Price, IsActive) VALUES
    (3, N'Острый соус Спайси', 40.00, 1),
    (3, N'Маринованный имбирь и васаби', 35.00, 1),
    (3, N'Классический соевый соус', 30.00, 1),
    (3, N'Сырная запечённая шапочка', 55.00, 1);
END

-- Добавляем допы для десертов (CategoryId = 4)
IF NOT EXISTS (SELECT 1 FROM Addons WHERE Name = N'Шарик ванильного пломбира')
BEGIN
    INSERT INTO Addons (CategoryId, Name, Price, IsActive) VALUES
    (4, N'Шарик ванильного пломбира', 60.00, 1),
    (4, N'Соленая карамель топинг', 40.00, 1),
    (4, N'Бельгийский шоколадный топинг', 40.00, 1),
    (4, N'Дробленый фундук и миндаль', 45.00, 1),
    (4, N'Веточка свежей мяты', 20.00, 1);
END

-- Добавляем допы для напитков (CategoryId = 5)
IF NOT EXISTS (SELECT 1 FROM Addons WHERE Name = N'Кубики чистейшего льда')
BEGIN
    INSERT INTO Addons (CategoryId, Name, Price, IsActive) VALUES
    (5, N'Кубики чистейшего льда', 10.00, 1),
    (5, N'Долька свежего лимона', 20.00, 1),
    (5, N'Веточка свежей мяты', 25.00, 1),
    (5, N'Ванильный сироп Monin', 35.00, 1),
    (5, N'Карамельный сироп Monin', 35.00, 1);
END
GO
