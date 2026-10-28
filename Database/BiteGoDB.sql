-- ============================================================================
-- Проект: BiteGo («Быстрый Укус») — Сервис доставки еды
-- База данных: Microsoft SQL Server (BiteGoDB)
-- Город внедрения: г. Балашов
-- Версия: 2.0 (Расширенная архитектура с защитой от многопоточности и учетом склада)
-- ============================================================================

SET NOCOUNT ON;
GO

-- 1. Создание базы данных (если не существует)
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'BiteGoDB')
BEGIN
    CREATE DATABASE [BiteGoDB]
    COLLATE Cyrillic_General_100_CI_AS;
    PRINT N'База данных BiteGoDB успешно создана.';
END
ELSE
BEGIN
    PRINT N'База данных BiteGoDB уже существует, переключаем контекст.';
END
GO

USE [BiteGoDB];
GO

-- 2. Удаление существующих внешних ключей и таблиц (для чистого пересоздания)
IF OBJECT_ID(N'dbo.Reviews', N'U') IS NOT NULL DROP TABLE dbo.Reviews;
IF OBJECT_ID(N'dbo.Payments', N'U') IS NOT NULL DROP TABLE dbo.Payments;
IF OBJECT_ID(N'dbo.OrderItemAddons', N'U') IS NOT NULL DROP TABLE dbo.OrderItemAddons;
IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NOT NULL DROP TABLE dbo.OrderItems;
IF OBJECT_ID(N'dbo.Orders', N'U') IS NOT NULL DROP TABLE dbo.Orders;
IF OBJECT_ID(N'dbo.StockLog', N'U') IS NOT NULL DROP TABLE dbo.StockLog;
IF OBJECT_ID(N'dbo.ProductIngredients', N'U') IS NOT NULL DROP TABLE dbo.ProductIngredients;
IF OBJECT_ID(N'dbo.Ingredients', N'U') IS NOT NULL DROP TABLE dbo.Ingredients;
IF OBJECT_ID(N'dbo.Addons', N'U') IS NOT NULL DROP TABLE dbo.Addons;
IF OBJECT_ID(N'dbo.Products', N'U') IS NOT NULL DROP TABLE dbo.Products;
IF OBJECT_ID(N'dbo.Categories', N'U') IS NOT NULL DROP TABLE dbo.Categories;
IF OBJECT_ID(N'dbo.Couriers', N'U') IS NOT NULL DROP TABLE dbo.Couriers;
IF OBJECT_ID(N'dbo.Addresses', N'U') IS NOT NULL DROP TABLE dbo.Addresses;
IF OBJECT_ID(N'dbo.Statuses', N'U') IS NOT NULL DROP TABLE dbo.Statuses;
IF OBJECT_ID(N'dbo.LocalStreets', N'U') IS NOT NULL DROP TABLE dbo.LocalStreets;
IF OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL DROP TABLE dbo.Users;
GO

PRINT N'Старые таблицы успешно очищены.';
GO

-- ============================================================================
-- 3. СОЗДАНИЕ ТАБЛИЦ (DDL)
-- ============================================================================

-- 3.1. Таблица пользователей (Клиенты и Администраторы)
CREATE TABLE dbo.Users (
    Id INT IDENTITY(1,1) NOT NULL,
    FullName NVARCHAR(100) NOT NULL,
    Phone NVARCHAR(20) NOT NULL,
    Email NVARCHAR(100) NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    Role NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_Role DEFAULT (N'customer'), -- 'customer' или 'admin'
    BonusPoints INT NOT NULL CONSTRAINT DF_Users_BonusPoints DEFAULT (0),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_Users_Phone UNIQUE (Phone),
    CONSTRAINT CK_Users_Role CHECK (Role IN (N'customer', N'admin')),
    CONSTRAINT CK_Users_BonusPoints CHECK (BonusPoints >= 0)
);
GO

-- 3.2. Таблица категорий меню
CREATE TABLE dbo.Categories (
    Id INT IDENTITY(1,1) NOT NULL,
    Name NVARCHAR(50) NOT NULL,
    Icon NVARCHAR(10) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_Categories_SortOrder DEFAULT (0),
    IsActive BIT NOT NULL CONSTRAINT DF_Categories_IsActive DEFAULT (1),
    CONSTRAINT PK_Categories PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_Categories_Name UNIQUE (Name)
);
GO

-- 3.3. Таблица блюд / меню (с контролем конкурентного доступа RowVersion)
CREATE TABLE dbo.Products (
    Id INT IDENTITY(1,1) NOT NULL,
    CategoryId INT NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500) NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    ImageUrl NVARCHAR(500) NOT NULL,
    WeightGram INT NOT NULL,
    CaloriesKcal INT NOT NULL,
    CookingTimeMinutes INT NOT NULL CONSTRAINT DF_Products_CookingTime DEFAULT (15),
    StockQuantity INT NOT NULL CONSTRAINT DF_Products_StockQuantity DEFAULT (0),
    IsActive BIT NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT (1),
    RowVersion ROWVERSION NOT NULL, -- Оптимистическая блокировка для исключения race conditions
    CONSTRAINT PK_Products PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_Products_Categories FOREIGN KEY (CategoryId) REFERENCES dbo.Categories (Id),
    CONSTRAINT CK_Products_Price CHECK (Price >= 0),
    CONSTRAINT CK_Products_Weight CHECK (WeightGram > 0),
    CONSTRAINT CK_Products_Stock CHECK (StockQuantity >= 0)
);
GO

-- 3.4. Таблица справочника ингредиентов
CREATE TABLE dbo.Ingredients (
    Id INT IDENTITY(1,1) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    IsRemovable BIT NOT NULL CONSTRAINT DF_Ingredients_IsRemovable DEFAULT (1),
    CONSTRAINT PK_Ingredients PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_Ingredients_Name UNIQUE (Name)
);
GO

-- 3.5. Составные ингредиенты блюда (для конструктора "убрать ингредиент")
CREATE TABLE dbo.ProductIngredients (
    ProductId INT NOT NULL,
    IngredientId INT NOT NULL,
    IsDefault BIT NOT NULL CONSTRAINT DF_ProductIngredients_IsDefault DEFAULT (1),
    CONSTRAINT PK_ProductIngredients PRIMARY KEY CLUSTERED (ProductId, IngredientId),
    CONSTRAINT FK_PI_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products (Id) ON DELETE CASCADE,
    CONSTRAINT FK_PI_Ingredients FOREIGN KEY (IngredientId) REFERENCES dbo.Ingredients (Id) ON DELETE CASCADE
);
GO

-- 3.6. Таблица платных дополнений (Addons: доп. сыр, соус, бекон)
CREATE TABLE dbo.Addons (
    Id INT IDENTITY(1,1) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Addons_IsActive DEFAULT (1),
    CONSTRAINT PK_Addons PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Addons_Price CHECK (Price >= 0)
);
GO

-- 3.7. Таблица адресов клиентов
CREATE TABLE dbo.Addresses (
    Id INT IDENTITY(1,1) NOT NULL,
    UserId INT NOT NULL,
    City NVARCHAR(50) NOT NULL CONSTRAINT DF_Addresses_City DEFAULT (N'Балашов'),
    Street NVARCHAR(150) NOT NULL,
    House NVARCHAR(20) NOT NULL,
    Apartment NVARCHAR(20) NULL,
    Entrance NVARCHAR(10) NULL,
    Floor NVARCHAR(10) NULL,
    Intercom NVARCHAR(20) NULL,
    Comment NVARCHAR(250) NULL,
    IsDefault BIT NOT NULL CONSTRAINT DF_Addresses_IsDefault DEFAULT (0),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Addresses_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Addresses PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_Addresses_Users FOREIGN KEY (UserId) REFERENCES dbo.Users (Id) ON DELETE CASCADE
);
GO

-- 3.8. Таблица курьеров
CREATE TABLE dbo.Couriers (
    Id INT IDENTITY(1,1) NOT NULL,
    FullName NVARCHAR(100) NOT NULL,
    Phone NVARCHAR(20) NOT NULL,
    PhotoUrl NVARCHAR(500) NOT NULL,
    Status NVARCHAR(30) NOT NULL CONSTRAINT DF_Couriers_Status DEFAULT (N'Свободен'), -- 'Свободен', 'На доставке', 'Не на смене'
    DeliveryRate DECIMAL(10,2) NOT NULL CONSTRAINT DF_Couriers_DeliveryRate DEFAULT (150.00), -- Ставка курьера за 1 выполненный заказ
    TotalDeliveriesCount INT NOT NULL CONSTRAINT DF_Couriers_Count DEFAULT (0),
    RowVersion ROWVERSION NOT NULL, -- Оптимистическая блокировка при назначении курьера
    CONSTRAINT PK_Couriers PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Couriers_Status CHECK (Status IN (N'Свободен', N'На доставке', N'Не на смене')),
    CONSTRAINT CK_Couriers_DeliveryRate CHECK (DeliveryRate >= 0)
);
GO

-- 3.9. Справочник статусов заказа
CREATE TABLE dbo.Statuses (
    Id INT NOT NULL,
    Code NVARCHAR(30) NOT NULL,
    Name NVARCHAR(50) NOT NULL,
    Description NVARCHAR(200) NOT NULL,
    SortOrder INT NOT NULL,
    CONSTRAINT PK_Statuses PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_Statuses_Code UNIQUE (Code)
);
GO

-- 3.10. Таблица заказов
CREATE TABLE dbo.Orders (
    Id INT IDENTITY(1,1) NOT NULL,
    OrderNumber NVARCHAR(30) NOT NULL,
    UserId INT NOT NULL,
    AddressId INT NULL,
    DeliveryAddressText NVARCHAR(300) NOT NULL, -- Слепок адреса на момент оформления заказа
    CourierId INT NULL,
    StatusId INT NOT NULL,
    Subtotal DECIMAL(10,2) NOT NULL,
    BonusPointsUsed INT NOT NULL CONSTRAINT DF_Orders_BonusUsed DEFAULT (0),
    BonusPointsEarned INT NOT NULL CONSTRAINT DF_Orders_BonusEarned DEFAULT (0),
    DeliveryFee DECIMAL(10,2) NOT NULL CONSTRAINT DF_Orders_DeliveryFee DEFAULT (0.00),
    TotalAmount DECIMAL(10,2) NOT NULL,
    PaymentMethod NVARCHAR(50) NOT NULL, -- 'Наличными курьеру', 'Картой курьеру'
    PaymentStatus NVARCHAR(30) NOT NULL CONSTRAINT DF_Orders_PaymentStatus DEFAULT (N'Ожидает оплаты'), -- 'Ожидает оплаты', 'Оплачено', 'Возврат'
    EstimatedCookingMinutes INT NOT NULL CONSTRAINT DF_Orders_CookingMinutes DEFAULT (20),
    EstimatedDeliveryTime DATETIME2(0) NOT NULL,
    CustomerNote NVARCHAR(300) NULL,
    CancellationReason NVARCHAR(250) NULL,
    IssueType NVARCHAR(50) NULL, -- 'Не доставлено', 'Не то блюдо', 'Повреждено', 'Другое'
    IssueComment NVARCHAR(500) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT (SYSUTCDATETIME()),
    DeliveredAt DATETIME2(0) NULL,
    CompletedAt DATETIME2(0) NULL,
    RowVersion ROWVERSION NOT NULL, -- Защита от параллельного изменения статуса
    CONSTRAINT PK_Orders PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_Orders_Number UNIQUE (OrderNumber),
    CONSTRAINT FK_Orders_Users FOREIGN KEY (UserId) REFERENCES dbo.Users (Id),
    CONSTRAINT FK_Orders_Addresses FOREIGN KEY (AddressId) REFERENCES dbo.Addresses (Id),
    CONSTRAINT FK_Orders_Couriers FOREIGN KEY (CourierId) REFERENCES dbo.Couriers (Id),
    CONSTRAINT FK_Orders_Statuses FOREIGN KEY (StatusId) REFERENCES dbo.Statuses (Id),
    CONSTRAINT CK_Orders_TotalAmount CHECK (TotalAmount >= 0),
    CONSTRAINT CK_Orders_BonusPoints CHECK (BonusPointsUsed >= 0 AND BonusPointsEarned >= 0)
);
GO

-- 3.11. Позиции заказа (OrderItems)
CREATE TABLE dbo.OrderItems (
    Id INT IDENTITY(1,1) NOT NULL,
    OrderId INT NOT NULL,
    ProductId INT NOT NULL,
    Quantity INT NOT NULL,
    UnitPrice DECIMAL(10,2) NOT NULL,
    ItemsPrice DECIMAL(10,2) NOT NULL,
    AddonsPrice DECIMAL(10,2) NOT NULL CONSTRAINT DF_OrderItems_AddonsPrice DEFAULT (0.00),
    TotalPrice DECIMAL(10,2) NOT NULL,
    ExcludedIngredientsText NVARCHAR(250) NULL, -- Например: "Без лука, Без халапеньо"
    AddedAddonsText NVARCHAR(250) NULL, -- Например: "Доп. сыр Чеддер (+55 ₽)"
    CONSTRAINT PK_OrderItems PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (OrderId) REFERENCES dbo.Orders (Id) ON DELETE CASCADE,
    CONSTRAINT FK_OrderItems_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products (Id),
    CONSTRAINT CK_OrderItems_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_OrderItems_Prices CHECK (UnitPrice >= 0 AND TotalPrice >= 0)
);
GO

-- 3.12. Дополнения к позиции заказа
CREATE TABLE dbo.OrderItemAddons (
    Id INT IDENTITY(1,1) NOT NULL,
    OrderItemId INT NOT NULL,
    AddonId INT NOT NULL,
    AddonName NVARCHAR(100) NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_OrderItemAddons PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_OIA_OrderItems FOREIGN KEY (OrderItemId) REFERENCES dbo.OrderItems (Id) ON DELETE CASCADE,
    CONSTRAINT FK_OIA_Addons FOREIGN KEY (AddonId) REFERENCES dbo.Addons (Id)
);
GO

-- 3.13. Таблица платежей
CREATE TABLE dbo.Payments (
    Id INT IDENTITY(1,1) NOT NULL,
    OrderId INT NOT NULL,
    PaymentMethod NVARCHAR(50) NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    Status NVARCHAR(30) NOT NULL CONSTRAINT DF_Payments_Status DEFAULT (N'Ожидает оплаты'), -- 'Ожидает оплаты', 'Оплачено', 'Возврат'
    PaidAt DATETIME2(0) NULL,
    TransactionRef NVARCHAR(100) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Payments_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Payments PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_Payments_Orders FOREIGN KEY (OrderId) REFERENCES dbo.Orders (Id)
);
GO

-- 3.14. Журнал движения остатков на складе (StockLog) — прозрачность списаний и поставок
CREATE TABLE dbo.StockLog (
    Id INT IDENTITY(1,1) NOT NULL,
    ProductId INT NOT NULL,
    ChangeType NVARCHAR(50) NOT NULL, -- 'Поступление', 'Списание (заказ)', 'Возврат (отмена)', 'Корректировка'
    QuantityChange INT NOT NULL, -- +20 или -2
    RemainingStock INT NOT NULL, -- Остаток на складе после совершения операции
    CostPerUnit DECIMAL(10,2) NULL, -- Себестоимость единицы (для расчета затрат бизнеса)
    Reason NVARCHAR(250) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StockLog_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId INT NULL,
    CONSTRAINT PK_StockLog PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_StockLog_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products (Id),
    CONSTRAINT FK_StockLog_Users FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users (Id)
);
GO

-- 3.15. Таблица отзывов клиентов
CREATE TABLE dbo.Reviews (
    Id INT IDENTITY(1,1) NOT NULL,
    OrderId INT NOT NULL,
    UserId INT NOT NULL,
    Rating INT NOT NULL,
    Comment NVARCHAR(1000) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Reviews_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Reviews PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_Reviews_Orders FOREIGN KEY (OrderId) REFERENCES dbo.Orders (Id),
    CONSTRAINT FK_Reviews_Users FOREIGN KEY (UserId) REFERENCES dbo.Users (Id),
    CONSTRAINT CK_Reviews_Rating CHECK (Rating BETWEEN 1 AND 5)
);
GO

-- 3.16. Локальный оффлайн-справочник улиц г. Балашов (Fallback при отсутствии DaData API)
CREATE TABLE dbo.LocalStreets (
    Id INT IDENTITY(1,1) NOT NULL,
    City NVARCHAR(50) NOT NULL CONSTRAINT DF_LocalStreets_City DEFAULT (N'Балашов'),
    StreetName NVARCHAR(150) NOT NULL,
    PopularityRank INT NOT NULL CONSTRAINT DF_LocalStreets_Rank DEFAULT (1),
    CONSTRAINT PK_LocalStreets PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_LocalStreets_Name UNIQUE (StreetName)
);
GO

-- Индексы для ускорения поиска и фильтрации
CREATE NONCLUSTERED INDEX IX_Orders_UserId_StatusId ON dbo.Orders (UserId, StatusId);
CREATE NONCLUSTERED INDEX IX_Orders_CreatedAt ON dbo.Orders (CreatedAt DESC);
CREATE NONCLUSTERED INDEX IX_StockLog_ProductId_CreatedAt ON dbo.StockLog (ProductId, CreatedAt DESC);
CREATE NONCLUSTERED INDEX IX_Products_CategoryId_IsActive ON dbo.Products (CategoryId, IsActive);
GO

PRINT N'Все 16 таблиц и индексы успешно созданы.';
GO

-- ============================================================================
-- 4. НАПОЛНЕНИЕ ДАННЫМИ (SEED DATA)
-- ============================================================================

-- 4.1. Справочник статусов
INSERT INTO dbo.Statuses (Id, Code, Name, Description, SortOrder) VALUES
(1, N'New',           N'Новый',                N'Заказ зарегистрирован и ожидает подтверждения кухней', 1),
(2, N'Cooking',       N'Готовится',            N'Повара приступили к приготовлению блюд', 2),
(3, N'Ready',         N'Собран',               N'Заказ упакован в термосумку и ожидает курьера', 3),
(4, N'InDelivery',    N'В пути',               N'Курьер забрал заказ и доставляет его по адресу', 4),
(5, N'Delivered',     N'Доставлен',            N'Курьер прибыл и передал заказ (ожидает подтверждения)', 5),
(6, N'Completed',     N'Получен клиентом',     N'Клиент подтвердил получение заказа, начислены бонусы', 6),
(7, N'Cancelled',     N'Отменен',              N'Заказ отменен системой или администратором', 7),
(8, N'IssueReported', N'Жалоба на доставку',   N'Клиент сообщил о возникшей проблеме с заказом', 8);
GO

-- 4.2. Пользователи
-- Хеш пароля для 'admin123': $2a$11$87QmGtnMDwd3Stu8V5pGvO1f5jJ4ylS.nzS7eZkNDtx4UqycQUfNO
-- Хеш пароля для 'user123':  $2a$11$2SJJOThKMvtjoTK1pM1k5uezIi7dgetuOyGpFrXVWS89aFq.RXKQC
INSERT INTO dbo.Users (FullName, Phone, Email, PasswordHash, Role, BonusPoints) VALUES
(N'Администратор BiteGo', N'+79990000001', N'admin@bitego.ru',    N'$2a$11$87QmGtnMDwd3Stu8V5pGvO1f5jJ4ylS.nzS7eZkNDtx4UqycQUfNO', N'admin', 0),
(N'Иван Смирнов',        N'+79991112233', N'ivan.sm@mail.ru',     N'$2a$11$2SJJOThKMvtjoTK1pM1k5uezIi7dgetuOyGpFrXVWS89aFq.RXKQC', N'customer', 350),
(N'Анна Кузнецова',      N'+79992223344', N'anna.k@yandex.ru',    N'$2a$11$2SJJOThKMvtjoTK1pM1k5uezIi7dgetuOyGpFrXVWS89aFq.RXKQC', N'customer', 120),
(N'Максим Орлов',        N'+79993334455', N'm.orlov@gmail.com',   N'$2a$11$2SJJOThKMvtjoTK1pM1k5uezIi7dgetuOyGpFrXVWS89aFq.RXKQC', N'customer', 50);
GO

-- 4.3. Категории меню
SET IDENTITY_INSERT dbo.Categories ON;
INSERT INTO dbo.Categories (Id, Name, Icon, SortOrder, IsActive) VALUES
(1, N'Пицца',   N'🍕', 1, 1),
(2, N'Бургеры', N'🍔', 2, 1),
(3, N'Роллы',   N'🍣', 3, 1),
(4, N'Десерты', N'🍫', 4, 1),
(5, N'Напитки', N'🥤', 5, 1);
SET IDENTITY_INSERT dbo.Categories OFF;
GO

-- 4.4. Справочник ингредиентов
SET IDENTITY_INSERT dbo.Ingredients ON;
INSERT INTO dbo.Ingredients (Id, Name, IsRemovable) VALUES
(1,  N'Сыр Моцарелла',       1),
(2,  N'Сыр Пармезан',        1),
(3,  N'Сыр Дор Блю',         1),
(4,  N'Сыр Чеддер',          1),
(5,  N'Томатный соус',       1),
(6,  N'Соус Барбекю',        1),
(7,  N'Колбаски Пепперони',  1),
(8,  N'Ветчина из индейки',  1),
(9,  N'Котлета из говядины', 1),
(10, N'Маринованные огурцы', 1),
(11, N'Свежие томаты',       1),
(12, N'Красный лук',         1),
(13, N'Шампиньоны свежие',   1),
(14, N'Острый перец халапеньо', 1),
(15, N'Салат Айсберг',       1),
(16, N'Лосось слабосоленый', 1),
(17, N'Сливочный сыр Cremette', 1),
(18, N'Свежий огурец',       1),
(19, N'Авокадо спелый',      1),
(20, N'Тигровая креветка',   1);
SET IDENTITY_INSERT dbo.Ingredients OFF;
GO

-- 4.5. Платные дополнения (Addons)
SET IDENTITY_INSERT dbo.Addons ON;
INSERT INTO dbo.Addons (Id, Name, Price, IsActive) VALUES
(1, N'Дополнительный сыр Чеддер', 55.00, 1),
(2, N'Острый перец халапеньо',    45.00, 1),
(3, N'Хрустящий жареный бекон',   75.00, 1),
(4, N'Соус Сырный Heinz',         40.00, 1),
(5, N'Соус Барбекю Heinz',        40.00, 1),
(6, N'Соус Чесночный Ранч',       40.00, 1),
(7, N'Сладкий соус Унаги',        45.00, 1);
SET IDENTITY_INSERT dbo.Addons OFF;
GO

-- 4.6. Блюда меню (Products)
-- Примечание: Для проверки на защите две позиции специально имеют StockQuantity = 0 ("Нет в наличии")
SET IDENTITY_INSERT dbo.Products ON;
INSERT INTO dbo.Products (Id, CategoryId, Name, Description, Price, ImageUrl, WeightGram, CaloriesKcal, CookingTimeMinutes, StockQuantity, IsActive) VALUES
-- Пицца
(1, 1, N'Пицца Пепперони', 
 N'Классическая острая пицца с пикантными колбасками пепперони, нежной моцареллой и фирменным томатным соусом.', 
 650.00, N'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=700&auto=format&fit=crop&q=80', 540, 1250, 15, 18, 1),

(2, 1, N'Пицца 4 Сыра', 
 N'Изысканное сочетание четырех благородных сыров: Моцарелла, Пармезан, Дор Блю и мягкий Чеддер со сливочной основой.', 
 720.00, N'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=700&auto=format&fit=crop&q=80', 510, 1180, 15, 14, 1),

(3, 1, N'Пицца Мясная Барбекю', 
 N'Сытная пицца с сочной говядиной, беконом, ветчиной, красным луком под ароматным дымным соусом барбекю.', 
 790.00, N'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=700&auto=format&fit=crop&q=80', 620, 1420, 18, 9, 1),

(4, 1, N'Пицца Маргарита', 
 N'Традиционный итальянский рецепт: сочные томаты, обилие сыра моцарелла и свежий базилик с орегано.', 
 550.00, N'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=700&auto=format&fit=crop&q=80', 480, 990, 12, 0, 1), -- НЕТ В НАЛИЧИИ (для демонстрации!)

(5, 1, N'Пицца Ветчина и Грибы', 
 N'Нежная ветчина из индейки, обжаренные свежие шампиньоны, моцарелла и сливочно-чесночный соус.', 
 680.00, N'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=700&auto=format&fit=crop&q=80', 560, 1150, 15, 22, 1),

-- Бургеры
(6, 2, N'Бургер «Байт Шеф»', 
 N'Флагманский бургер BiteGo: рубленая мраморная говядина, сыр чеддер, свежие томаты, маринованный огурчик и карамелизированный лук на булочке бриошь.', 
 480.00, N'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=700&auto=format&fit=crop&q=80', 340, 780, 10, 25, 1),

(7, 2, N'Чизбургер Двойной', 
 N'Две сочные говяжьи котлеты с двойной порцией расплавленного сыра Чеддер, горчичным соусом и солеными огурчиками.', 
 420.00, N'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=700&auto=format&fit=crop&q=80', 310, 720, 10, 16, 1),

(8, 2, N'Бургер «Техас BBQ»', 
 N'Говяжья котлета гриль, полоски хрустящего бекона, сыр чеддер, луковые кольца и насыщенный техасский BBQ-соус.', 
 490.00, N'https://images.unsplash.com/photo-1550547660-d9450f859349?w=700&auto=format&fit=crop&q=80', 360, 840, 12, 11, 1),

(9, 2, N'Чикен Бургер Хрустящий', 
 N'Нежное куриное филе в золотистой панировке, салат айсберг, спелые томаты и легкий сливочный майо-соус.', 
 380.00, N'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=700&auto=format&fit=crop&q=80', 290, 620, 10, 20, 1),

-- Роллы
(10, 3, N'Филадельфия Премиум', 
 N'Крупные роллы со щедрым пластом слабосоленого норвежского лосося, нежным сливочным сыром Cremette и свежим огурцом.', 
 590.00, N'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=700&auto=format&fit=crop&q=80', 260, 480, 15, 17, 1),

(11, 3, N'Калифорния с Крабом', 
 N'Нежное мясо снежного краба, спелое авокадо, огурчик, японский майонез и хрустящая икра тобико.', 
 460.00, N'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=700&auto=format&fit=crop&q=80', 230, 410, 12, 15, 1),

(12, 3, N'Запечённый Сяке Ролл', 
 N'Теплый ролл с лососем, огурцом под пышной сырной шапочкой из моцареллы и соуса спайси, политый унаги.', 
 520.00, N'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=700&auto=format&fit=crop&q=80', 270, 530, 16, 12, 1),

(13, 3, N'Темпура с Креветкой', 
 N'Хрустящий горячий ролл в воздушном кляре темпура с тигровой креветкой, сливочным сыром и соусом унаги.', 
 540.00, N'https://images.unsplash.com/photo-1553621042-f6e147245754?w=700&auto=format&fit=crop&q=80', 250, 510, 15, 0, 1), -- НЕТ В НАЛИЧИИ!

-- Десерты
(14, 4, N'Чизкейк Нью-Йорк', 
 N'Классический сливочный чизкейк из творожного сыра на тонком песочном корже с легкой ванильной ноткой.', 
 280.00, N'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=700&auto=format&fit=crop&q=80', 140, 390, 5, 28, 1),

(15, 4, N'Шоколадный Фондан', 
 N'Французский шоколадный бисквит с теплой тающей шоколадной сердцевиной из темного бельгийского шоколада.', 
 320.00, N'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=700&auto=format&fit=crop&q=80', 120, 440, 8, 14, 1),

(16, 4, N'Тирамису Классический', 
 N'Традиционный итальянский десерт с печеньем савоярди, кофейной пропиткой и кремом из маскарпоне.', 
 290.00, N'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=700&auto=format&fit=crop&q=80', 150, 360, 5, 19, 1),

(17, 4, N'Донат с Карамелью', 
 N'Пышный пончик с мягкой соленой карамелью внутри и нежной глазурью с хрустящими шариками.', 
 160.00, N'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=700&auto=format&fit=crop&q=80', 85, 290, 2, 30, 1),

-- Напитки
(18, 5, N'Лимонад Цитрус-Мята', 
 N'Освежающий натуральный лимонад собственного приготовления из сока апельсина, лимона и свежей мяты.', 
 210.00, N'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=700&auto=format&fit=crop&q=80', 500, 110, 3, 40, 1),

(19, 5, N'Морс Клюквенный Домашний', 
 N'Традиционный морс из отборной лесной клюквы с добавлением сибирских трав и натурального меда.', 
 190.00, N'https://images.unsplash.com/photo-1546173159-315724a31d9b?w=700&auto=format&fit=crop&q=80', 500, 95, 3, 35, 1),

(20, 5, N'Кофе Капучино', 
 N'Ароматный кофе из свежеобжаренной 100% арабики с пышной бархатистой молочной пенкой.', 
 190.00, N'https://images.unsplash.com/photo-1534778101976-62847782c213?w=700&auto=format&fit=crop&q=80', 350, 140, 4, 50, 1),

(21, 5, N'Чай Облепиховый с Имбирем', 
 N'Согревающий чай из натуральной протертой облепихи, корня свежего имбиря, апельсина и бадьяна.', 
 230.00, N'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=700&auto=format&fit=crop&q=80', 500, 80, 5, 25, 1);
SET IDENTITY_INSERT dbo.Products OFF;
GO

-- 4.7. Составные ингредиенты блюд (ProductIngredients)
-- 4 Сыра (можно убрать любой сыр!)
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(2, 1, 1), -- Моцарелла
(2, 2, 1), -- Пармезан
(2, 3, 1), -- Дор Блю
(2, 4, 1); -- Чеддер

-- Пепперони
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(1, 1, 1), -- Моцарелла
(1, 5, 1), -- Томатный соус
(1, 7, 1); -- Пепперони

-- Мясная Барбекю
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(3, 1, 1), -- Моцарелла
(3, 6, 1), -- Барбекю соус
(3, 8, 1), -- Ветчина
(3, 12, 1); -- Красный лук

-- Ветчина и Грибы
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(5, 1, 1), -- Моцарелла
(5, 8, 1), -- Ветчина
(5, 13, 1); -- Шампиньоны

-- Бургер Байт Шеф
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(6, 9, 1),  -- Котлета
(6, 4, 1),  -- Чеддер
(6, 11, 1), -- Томаты
(6, 10, 1), -- Огурчики
(6, 12, 1), -- Лук
(6, 15, 1); -- Айсберг

-- Чизбургер Двойной
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(7, 9, 1),  -- Котлета
(7, 4, 1),  -- Чеддер
(7, 10, 1), -- Огурчики
(7, 12, 1); -- Лук

-- Бургер Техас BBQ
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(8, 9, 1),  -- Котлета
(8, 4, 1),  -- Чеддер
(8, 6, 1),  -- BBQ
(8, 14, 1); -- Халапеньо

-- Ролл Филадельфия
INSERT INTO dbo.ProductIngredients (ProductId, IngredientId, IsDefault) VALUES
(10, 16, 1), -- Лосось
(10, 17, 1), -- Сливочный сыр
(10, 18, 1); -- Огурец
GO

-- 4.8. Адреса пользователей (г. Балашов)
INSERT INTO dbo.Addresses (UserId, City, Street, House, Apartment, Entrance, Floor, Intercom, Comment, IsDefault) VALUES
(2, N'Балашов', N'ул. Ленина',          N'18', N'42', N'2', N'4', N'42K', N'Домофон работает, подняться на лифте', 1),
(2, N'Балашов', N'ул. Карла Маркса',    N'35', N'12', N'1', N'2', N'12',  N'Офисное здание, позвонить от входа',   0),
(3, N'Балашов', N'ул. Советская',       N'64', N'7',  N'1', N'1', NULL,   N'Частный сектор, звонок у калитки',     1),
(4, N'Балашов', N'ул. 30 лет Победы',   N'5',  N'89', N'3', N'9', N'89',  N'Оставить у консьержа если задержитесь', 1);
GO

-- 4.9. Курьеры
-- Обратите внимание: Курьер Дмитрий Волков изначально "На доставке", чтобы сразу показать на защите блокировку занятого курьера!
INSERT INTO dbo.Couriers (FullName, Phone, PhotoUrl, Status, DeliveryRate, TotalDeliveriesCount) VALUES
(N'Алексей Морозов', N'+79170011221', N'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80', N'Свободен',    150.00, 48),
(N'Дмитрий Волков',  N'+79170011222', N'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80', N'На доставке', 150.00, 72),
(N'Сергей Попов',    N'+79170011223', N'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80', N'Свободен',    150.00, 35),
(N'Михаил Новиков',  N'+79170011224', N'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80', N'Не на смене', 150.00, 19);
GO

-- 4.10. Первоначальный журнал склада (StockLog) — доказательство для комиссии, откуда взялись товары и их себестоимость!
INSERT INTO dbo.StockLog (ProductId, ChangeType, QuantityChange, RemainingStock, CostPerUnit, Reason, CreatedByUserId) VALUES
(1,  N'Поступление', 20, 20, 240.00, N'Утренняя поставка замороженных основ и пепперони от поставщика «Мясницкий ряд»', 1),
(2,  N'Поступление', 15, 15, 270.00, N'Поставка сыров (Дор Блю, Пармезан, Моцарелла, Чеддер) от «Сыроварни Поволжья»', 1),
(3,  N'Поступление', 10, 10, 310.00, N'Поставка говяжьей вырезки и соуса барбекю', 1),
(5,  N'Поступление', 25, 25, 230.00, N'Поставка свежих шампиньонов и ветчины из индейки', 1),
(6,  N'Поступление', 30, 30, 180.00, N'Выпечка свежих булочек бриошь и котлет из мраморной говядины', 1),
(7,  N'Поступление', 20, 20, 150.00, N'Заготовка порций для чизбургеров на дневную смену', 1),
(8,  N'Поступление', 15, 15, 190.00, N'Поставка бекона и специй барбекю', 1),
(9,  N'Поступление', 25, 25, 130.00, N'Заготовка хрустящего куриного филе', 1),
(10, N'Поступление', 20, 20, 260.00, N'Поставка свежего атлантического лосося и сыра Cremette', 1),
(11, N'Поступление', 18, 18, 170.00, N'Закупка снежного краба и авокадо', 1),
(12, N'Поступление', 14, 14, 210.00, N'Подготовка порций для горячих запеченных роллов', 1),
(14, N'Поступление', 30, 30, 95.00,  N'Поставка порционных чизкейков Нью-Йорк', 1),
(15, N'Поступление', 15, 15, 110.00, N'Поставка бельгийского фондана', 1),
(16, N'Поступление', 20, 20, 105.00, N'Партия свежего тирамису', 1),
(17, N'Поступление', 30, 30, 45.00,  N'Утренняя выпечка карамельных донатов', 1),
(18, N'Поступление', 45, 45, 50.00,  N'Приготовление домашнего цитрусового концентрата', 1),
(19, N'Поступление', 40, 40, 40.00,  N'Варка клюквенного морса', 1),
(20, N'Поступление', 55, 55, 35.00,  N'Зерновой кофе арабика и фермерское молоко', 1),
(21, N'Поступление', 30, 30, 55.00,  N'Сбор облепиховой основы', 1);
GO

-- 4.11. Заказы для демонстрации всех статусов и бизнес-процессов
SET IDENTITY_INSERT dbo.Orders ON;

-- Заказ 1: Завершен (Доставлен и получен клиентом, есть отзыв и начислены бонусы)
INSERT INTO dbo.Orders (
    Id, OrderNumber, UserId, AddressId, DeliveryAddressText, CourierId, StatusId,
    Subtotal, BonusPointsUsed, BonusPointsEarned, DeliveryFee, TotalAmount,
    PaymentMethod, PaymentStatus, EstimatedCookingMinutes, EstimatedDeliveryTime,
    CustomerNote, CreatedAt, DeliveredAt, CompletedAt
) VALUES (
    1, N'BG-2026-1001', 2, 1, 
    N'г. Балашов, ул. Ленина, д. 18, кв. 42 (подъезд 2, этаж 4)', 
    1, 6, -- Status 6: Completed (Получен)
    1370.00, 50, 66, 0.00, 1320.00, 
    N'Картой курьеру', N'Оплачено', 15, DATEADD(MINUTE, 35, DATEADD(HOUR, -2, SYSUTCDATETIME())),
    N'Пожалуйста, положите побольше салфеток', 
    DATEADD(HOUR, -2, SYSUTCDATETIME()), 
    DATEADD(MINUTE, -75, SYSUTCDATETIME()), 
    DATEADD(MINUTE, -70, SYSUTCDATETIME())
);

-- Заказ 2: В пути (InDelivery) — курьер Дмитрий Волков сейчас его везет!
INSERT INTO dbo.Orders (
    Id, OrderNumber, UserId, AddressId, DeliveryAddressText, CourierId, StatusId,
    Subtotal, BonusPointsUsed, BonusPointsEarned, DeliveryFee, TotalAmount,
    PaymentMethod, PaymentStatus, EstimatedCookingMinutes, EstimatedDeliveryTime,
    CustomerNote, CreatedAt, DeliveredAt, CompletedAt
) VALUES (
    2, N'BG-2026-1002', 3, 3, 
    N'г. Балашов, ул. Советская, д. 64, кв. 7', 
    2, 4, -- Status 4: InDelivery (В пути)
    1200.00, 0, 60, 0.00, 1200.00, 
    N'Наличными курьеру', N'Ожидает оплаты', 18, DATEADD(MINUTE, 15, SYSUTCDATETIME()),
    N'Сдача с 2000 рублей, звонить в калитку', 
    DATEADD(MINUTE, -25, SYSUTCDATETIME()), 
    NULL, NULL
);

-- Заказ 3: Готовится на кухне (Cooking)
INSERT INTO dbo.Orders (
    Id, OrderNumber, UserId, AddressId, DeliveryAddressText, CourierId, StatusId,
    Subtotal, BonusPointsUsed, BonusPointsEarned, DeliveryFee, TotalAmount,
    PaymentMethod, PaymentStatus, EstimatedCookingMinutes, EstimatedDeliveryTime,
    CustomerNote, CreatedAt, DeliveredAt, CompletedAt
) VALUES (
    3, N'BG-2026-1003', 4, 4, 
    N'г. Балашов, ул. 30 лет Победы, д. 5, кв. 89 (подъезд 3, этаж 9)', 
    NULL, 2, -- Status 2: Cooking (Готовится)
    960.00, 0, 48, 0.00, 960.00, 
    N'Картой курьеру', N'Ожидает оплаты', 15, DATEADD(MINUTE, 30, SYSUTCDATETIME()),
    N'Без лука пожалуйста', 
    DATEADD(MINUTE, -10, SYSUTCDATETIME()), 
    NULL, NULL
);

-- Заказ 4: Новый (New) — только что поступил, ожидает оператора!
INSERT INTO dbo.Orders (
    Id, OrderNumber, UserId, AddressId, DeliveryAddressText, CourierId, StatusId,
    Subtotal, BonusPointsUsed, BonusPointsEarned, DeliveryFee, TotalAmount,
    PaymentMethod, PaymentStatus, EstimatedCookingMinutes, EstimatedDeliveryTime,
    CustomerNote, CreatedAt, DeliveredAt, CompletedAt
) VALUES (
    4, N'BG-2026-1004', 2, 2, 
    N'г. Балашов, ул. Карла Маркса, д. 35, кв. 12 (подъезд 1, этаж 2)', 
    NULL, 1, -- Status 1: New (Новый)
    720.00, 0, 36, 0.00, 720.00, 
    N'Картой курьеру', N'Ожидает оплаты', 15, DATEADD(MINUTE, 40, SYSUTCDATETIME()),
    N'Позвоните заранее, пропускной пункт', 
    DATEADD(MINUTE, -2, SYSUTCDATETIME()), 
    NULL, NULL
);

SET IDENTITY_INSERT dbo.Orders OFF;
GO

-- 4.12. Состав заказов (OrderItems)
SET IDENTITY_INSERT dbo.OrderItems ON;

-- Состав заказа 1 (BG-2026-1001): Пепперони + Байт Шеф + Доп. Сыр
INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Quantity, UnitPrice, ItemsPrice, AddonsPrice, TotalPrice, ExcludedIngredientsText, AddedAddonsText) VALUES
(1, 1, 1, 1, 650.00, 650.00, 0.00,  650.00, NULL, NULL),
(2, 1, 6, 1, 480.00, 480.00, 55.00, 535.00, N'Без красного лука', N'Дополнительный сыр Чеддер (+55 ₽)'),
(3, 1, 18, 1, 210.00, 210.00, 0.00, 210.00, NULL, NULL);

-- Состав заказа 2 (BG-2026-1002): Пицца 4 Сыра (убрали Дор Блю!) + Филадельфия
INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Quantity, UnitPrice, ItemsPrice, AddonsPrice, TotalPrice, ExcludedIngredientsText, AddedAddonsText) VALUES
(4, 2, 2, 1, 720.00, 720.00, 0.00, 720.00, N'Без сыра Дор Блю', NULL),
(5, 2, 6, 1, 480.00, 480.00, 0.00, 480.00, NULL, NULL);

-- Состав заказа 3 (BG-2026-1003): Бургер Техас BBQ + Кофе
INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Quantity, UnitPrice, ItemsPrice, AddonsPrice, TotalPrice, ExcludedIngredientsText, AddedAddonsText) VALUES
(6, 3, 8, 1, 490.00, 490.00, 75.00, 565.00, NULL, N'Хрустящий жареный бекон (+75 ₽)'),
(7, 3, 20, 2, 190.00, 380.00, 0.00, 380.00, NULL, NULL);

-- Состав заказа 4 (BG-2026-1004): Пицца 4 Сыра
INSERT INTO dbo.OrderItems (Id, OrderId, ProductId, Quantity, UnitPrice, ItemsPrice, AddonsPrice, TotalPrice, ExcludedIngredientsText, AddedAddonsText) VALUES
(8, 4, 2, 1, 720.00, 720.00, 0.00, 720.00, NULL, NULL);

SET IDENTITY_INSERT dbo.OrderItems OFF;
GO

-- 4.13. Дополнения к позициям заказа (OrderItemAddons)
INSERT INTO dbo.OrderItemAddons (OrderItemId, AddonId, AddonName, Price) VALUES
(2, 1, N'Дополнительный сыр Чеддер', 55.00),
(6, 3, N'Хрустящий жареный бекон', 75.00);
GO

-- 4.14. Записи в журнал списания по созданным заказам (StockLog)
INSERT INTO dbo.StockLog (ProductId, ChangeType, QuantityChange, RemainingStock, CostPerUnit, Reason) VALUES
(1,  N'Списание (заказ)', -1, 19, NULL, N'Списание по заказу BG-2026-1001'),
(6,  N'Списание (заказ)', -1, 29, NULL, N'Списание по заказу BG-2026-1001'),
(18, N'Списание (заказ)', -1, 44, NULL, N'Списание по заказу BG-2026-1001'),
(2,  N'Списание (заказ)', -1, 14, NULL, N'Списание по заказу BG-2026-1002'),
(8,  N'Списание (заказ)', -1, 14, NULL, N'Списание по заказу BG-2026-1003'),
(20, N'Списание (заказ)', -2, 53, NULL, N'Списание по заказу BG-2026-1003'),
(2,  N'Списание (заказ)', -1, 13, NULL, N'Списание по заказу BG-2026-1004');
GO

-- 4.15. Платежи
INSERT INTO dbo.Payments (OrderId, PaymentMethod, Amount, Status, PaidAt, TransactionRef) VALUES
(1, N'Картой курьеру',   1320.00, N'Оплачено',         DATEADD(MINUTE, -75, SYSUTCDATETIME()), N'POS-TRX-94821'),
(2, N'Наличными курьеру', 1200.00, N'Ожидает оплаты',   NULL,                                   NULL),
(3, N'Картой курьеру',   960.00,  N'Ожидает оплаты',   NULL,                                   NULL),
(4, N'Картой курьеру',   720.00,  N'Ожидает оплаты',   NULL,                                   NULL);
GO

-- 4.16. Отзывы клиентов
INSERT INTO dbo.Reviews (OrderId, UserId, Rating, Comment, CreatedAt) VALUES
(1, 2, 5, N'Доставили невероятно быстро, пицца Пепперони горячая, корочка хрустящая! Бургер «Байт Шеф» выше всех похвал. Огромное спасибо курьеру Алексею за вежливость!', DATEADD(MINUTE, -65, SYSUTCDATETIME()));
GO

-- 4.17. Справочник популярных улиц г. Балашов (Offline Fallback для подсказок адресов)
INSERT INTO dbo.LocalStreets (City, StreetName, PopularityRank) VALUES
(N'Балашов', N'ул. Ленина', 10),
(N'Балашов', N'ул. Карла Маркса', 9),
(N'Балашов', N'ул. Советская', 9),
(N'Балашов', N'ул. Володарского', 8),
(N'Балашов', N'ул. Луначарского', 8),
(N'Балашов', N'ул. 30 лет Победы', 8),
(N'Балашов', N'ул. Гагарина', 7),
(N'Балашов', N'ул. Энтузиастов', 7),
(N'Балашов', N'ул. Орджоникидзе', 7),
(N'Балашов', N'ул. Пушкина', 6),
(N'Балашов', N'ул. Юбилейная', 6),
(N'Балашов', N'ул. Строителей', 6),
(N'Балашов', N'ул. Нефтяная', 5),
(N'Балашов', N'пр. Космонавтов', 5),
(N'Балашов', N'ул. Коммунистическая', 5),
(N'Балашов', N'ул. Шоссейная', 5),
(N'Балашов', N'ул. Титова', 4),
(N'Балашов', N'ул. Рабочая', 4),
(N'Балашов', N'ул. Макаренко', 4),
(N'Балашов', N'ул. Привокзальная', 4),
(N'Балашов', N'ул. Декабристов', 4),
(N'Балашов', N'ул. Пионерская', 3),
(N'Балашов', N'ул. Урицкого', 3),
(N'Балашов', N'ул. Лесная', 3),
(N'Балашов', N'ул. Зеленая', 3);
GO

PRINT N'Тестовые данные успешно загружены!';
GO

-- Проверка целостности
SELECT N'Users' AS TableName, COUNT(*) AS RecordsCount FROM dbo.Users
UNION ALL SELECT N'Categories', COUNT(*) FROM dbo.Categories
UNION ALL SELECT N'Products', COUNT(*) FROM dbo.Products
UNION ALL SELECT N'Ingredients', COUNT(*) FROM dbo.Ingredients
UNION ALL SELECT N'ProductIngredients', COUNT(*) FROM dbo.ProductIngredients
UNION ALL SELECT N'Addons', COUNT(*) FROM dbo.Addons
UNION ALL SELECT N'Addresses', COUNT(*) FROM dbo.Addresses
UNION ALL SELECT N'Couriers', COUNT(*) FROM dbo.Couriers
UNION ALL SELECT N'Statuses', COUNT(*) FROM dbo.Statuses
UNION ALL SELECT N'Orders', COUNT(*) FROM dbo.Orders
UNION ALL SELECT N'OrderItems', COUNT(*) FROM dbo.OrderItems
UNION ALL SELECT N'OrderItemAddons', COUNT(*) FROM dbo.OrderItemAddons
UNION ALL SELECT N'Payments', COUNT(*) FROM dbo.Payments
UNION ALL SELECT N'StockLog', COUNT(*) FROM dbo.StockLog
UNION ALL SELECT N'Reviews', COUNT(*) FROM dbo.Reviews
UNION ALL SELECT N'LocalStreets', COUNT(*) FROM dbo.LocalStreets;
GO
