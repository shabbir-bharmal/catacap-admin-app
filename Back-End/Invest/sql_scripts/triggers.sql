USE Invest_db
GO
ALTER TRIGGER tr_AccountBalanceChange
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
    WHERE d.AccountBalance != i.AccountBalance;

    UPDATE ui 
    SET ui.LogTriggered = 1
    FROM UserInvestments ui
    JOIN INSERTED i ON ui.UserId = i.Id
    WHERE ui.LogTriggered = 0;
END;
