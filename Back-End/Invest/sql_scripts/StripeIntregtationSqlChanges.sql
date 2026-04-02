CREATE TABLE [dbo].[UserStripeCustomerMapping](
	[Id] [uniqueidentifier] NOT NULL,
	[UserId] [uniqueidentifier] NOT NULL,
	[CustomerId] [varchar](50) NOT NULL,
	[CardDetailToken] [varchar](500) NULL,
 CONSTRAINT [PK_UserStripeCustomerMapping] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

CREATE TABLE [dbo].[UserStripeTransactionMapping](
	[Id] [uniqueidentifier] NOT NULL,
	[UserId] [uniqueidentifier] NULL,
	[TransactionId] [varchar](250) NOT NULL,
	[Status] [varchar](50) NOT NULL,
	[Amount] [decimal](18, 2) NOT NULL,
	[Country] [varchar](50) NULL,
	[ZipCode] [varchar](50) NULL,
	[RequestedData] [nvarchar](max) NOT NULL,
	[ResponseData] [nvarchar](max) NOT NULL,
	[CreatedDate] [datetime] NULL,
	[ModifiedDate] [datetime] NULL,
 CONSTRAINT [PK_UserStripTransactionMapping] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TRIGGER [dbo].[tr_AccountBalanceChange]
ON [dbo].[AspNetUsers]
AFTER UPDATE
AS
BEGIN
    INSERT INTO AccountBalanceChangeLogs (UserId, UserName, OldValue, NewValue, ChangeDate, InvestmentName, PaymentType)
    SELECT
        i.Id,
        i.UserName,
        d.AccountBalance,
        i.AccountBalance,
        GETDATE(),
        ui.CampaignName,
        ui.PaymentType
    FROM INSERTED i
    JOIN DELETED d ON i.Id = d.Id
    LEFT JOIN UserInvestments ui ON i.Id = ui.UserId AND ui.LogTriggered = 0
    WHERE d.AccountBalance != i.AccountBalance AND ui.CampaignName IS NOT NULL AND ui.PaymentType IS NOT NULL; 
    UPDATE ui
    SET ui.LogTriggered = 1
    FROM UserInvestments ui
    JOIN INSERTED i ON ui.UserId = i.Id
    WHERE ui.LogTriggered = 0;
END;
GO