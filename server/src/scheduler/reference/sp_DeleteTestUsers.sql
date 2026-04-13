CREATE OR ALTER PROCEDURE [dbo].[sp_DeleteTestUsers]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    CREATE TABLE #TestUsers (Id VARCHAR(450) NOT NULL, Email VARCHAR(256) NOT NULL);

    INSERT INTO #TestUsers (Id, Email)
    SELECT Id, Email FROM AspNetUsers
    WHERE UserName  LIKE '%test%'
       OR Email     LIKE '%test%'
       OR FirstName LIKE '%test%'
       OR LastName  LIKE '%test%';

    IF NOT EXISTS (SELECT 1 FROM #TestUsers)
    BEGIN
        PRINT 'No test users found. Exiting.';
        DROP TABLE #TestUsers;
        RETURN;
    END;

    CREATE TABLE #TestCampaigns           (Id INT NOT NULL);
    CREATE TABLE #TestGroups              (Id INT NOT NULL);
    CREATE TABLE #TestPendingGrants       (Id INT NOT NULL);
    CREATE TABLE #TestDisbursalRequests   (Id INT NOT NULL);
    CREATE TABLE #TestAssetRequests       (Id INT NOT NULL);
    CREATE TABLE #TestFormSubmissions     (Id INT NOT NULL);
    CREATE TABLE #TestReturnMasters       (Id INT NOT NULL);
    CREATE TABLE #TestCompletedInvestments(Id INT NOT NULL);

    INSERT INTO #TestCampaigns
        SELECT Id FROM Campaigns WHERE UserId IN (SELECT Id FROM #TestUsers);

    INSERT INTO #TestGroups
        SELECT Id FROM Groups WHERE OwnerId IN (SELECT Id FROM #TestUsers);

    INSERT INTO #TestPendingGrants
        SELECT Id FROM PendingGrants WHERE UserId IN (SELECT Id FROM #TestUsers);

    INSERT INTO #TestDisbursalRequests
        SELECT Id FROM DisbursalRequest WHERE UserId IN (SELECT Id FROM #TestUsers);

    INSERT INTO #TestAssetRequests
        SELECT Id FROM AssetBasedPaymentRequest WHERE UserId IN (SELECT Id FROM #TestUsers);

    INSERT INTO #TestFormSubmissions
        SELECT Id FROM FormSubmission WHERE Email IN (SELECT Email FROM #TestUsers);

    INSERT INTO #TestReturnMasters
        SELECT Id FROM ReturnMasters WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

    INSERT INTO #TestCompletedInvestments
        SELECT Id FROM CompletedInvestmentsDetails WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE ApprovedBy          SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE AspNetUsers         SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE CataCapTeam         SET CreatedBy  = NULL WHERE CreatedBy  IN (SELECT Id FROM #TestUsers);
        UPDATE CataCapTeam         SET ModifiedBy = NULL WHERE ModifiedBy IN (SELECT Id FROM #TestUsers);
        UPDATE CataCapTeam         SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE EmailTemplate       SET CreatedBy  = NULL WHERE CreatedBy  IN (SELECT Id FROM #TestUsers);
        UPDATE EmailTemplate       SET ModifiedBy = NULL WHERE ModifiedBy IN (SELECT Id FROM #TestUsers);
        UPDATE EmailTemplate       SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE Event               SET CreatedBy  = NULL WHERE CreatedBy  IN (SELECT Id FROM #TestUsers);
        UPDATE Event               SET ModifiedBy = NULL WHERE ModifiedBy IN (SELECT Id FROM #TestUsers);
        UPDATE Event               SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE Faq                 SET CreatedBy  = NULL WHERE CreatedBy  IN (SELECT Id FROM #TestUsers);
        UPDATE Faq                 SET ModifiedBy = NULL WHERE ModifiedBy IN (SELECT Id FROM #TestUsers);
        UPDATE Faq                 SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE News                SET CreatedBy  = NULL WHERE CreatedBy  IN (SELECT Id FROM #TestUsers);
        UPDATE News                SET ModifiedBy = NULL WHERE ModifiedBy IN (SELECT Id FROM #TestUsers);
        UPDATE News                SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE InvestmentTag       SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE ModuleAccessPermission SET UpdatedBy = NULL WHERE UpdatedBy IN (SELECT Id FROM #TestUsers);

        UPDATE ReturnMasters       SET CreatedBy  = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND Id NOT IN (SELECT Id FROM #TestReturnMasters);

        UPDATE CompletedInvestmentNotes SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND CompletedInvestmentId NOT IN (SELECT Id FROM #TestCompletedInvestments);

        UPDATE CompletedInvestmentsDetails SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND Id NOT IN (SELECT Id FROM #TestCompletedInvestments);
        UPDATE CompletedInvestmentsDetails SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND Id NOT IN (SELECT Id FROM #TestCompletedInvestments);

        UPDATE SiteConfiguration   SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE Themes              SET DeletedBy  = NULL WHERE DeletedBy  IN (SELECT Id FROM #TestUsers);

        UPDATE Testimonial         SET DeletedBy  = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE ScheduledEmailLogs  SET DeletedBy  = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE AccountBalanceChangeLogs SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers);

        UPDATE AssetBasedPaymentRequestNotes SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND RequestId NOT IN (SELECT Id FROM #TestAssetRequests);

        UPDATE DisbursalRequestNotes SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND DisbursalRequestId NOT IN (SELECT Id FROM #TestDisbursalRequests);

        UPDATE FormSubmissionNotes SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND FormSubmissionId NOT IN (SELECT Id FROM #TestFormSubmissions);

        UPDATE InvestmentNotes SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND CampaignId NOT IN (SELECT Id FROM #TestCampaigns);

        UPDATE PendingGrantNotes SET CreatedBy = NULL
        WHERE CreatedBy IN (SELECT Id FROM #TestUsers)
          AND PendingGrantId NOT IN (SELECT Id FROM #TestPendingGrants);

        UPDATE AssetBasedPaymentRequest SET UpdatedBy = NULL
        WHERE UpdatedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);
        UPDATE AssetBasedPaymentRequest SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE DisbursalRequest SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE Campaigns SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE Groups SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND OwnerId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE PendingGrants SET DeletedBy  = NULL
        WHERE DeletedBy  IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);
        UPDATE PendingGrants SET RejectedBy = NULL
        WHERE RejectedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE Recommendations SET DeletedBy  = NULL
        WHERE DeletedBy  IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);
        UPDATE Recommendations SET RejectedBy = NULL
        WHERE RejectedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE Requests SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND RequestOwnerId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE ReturnDetails SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE InvestmentRequest SET ModifiedBy = NULL
        WHERE ModifiedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);
        UPDATE InvestmentRequest SET DeletedBy  = NULL
        WHERE DeletedBy  IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE InvestmentFeedback SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE UserInvestments SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE LeaderGroup SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE GroupAccountBalance SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE UsersNotifications SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND TargetUserId NOT IN (SELECT Id FROM #TestUsers);

        UPDATE FormSubmission SET DeletedBy = NULL
        WHERE DeletedBy IN (SELECT Id FROM #TestUsers)
          AND Email NOT IN (SELECT Email FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'AspNetUsers', ISNULL(CAST(t.Id AS VARCHAR(50)), '0'), t.Id, (SELECT u.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM AspNetUsers u INNER JOIN #TestUsers t ON u.Id = t.Id;

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'AspNetUserRoles', '0', (SELECT u.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM AspNetUserRoles u WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'Campaigns', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM Campaigns t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'Groups', ISNULL(CAST(Id AS VARCHAR(50)), '0'), OwnerId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM Groups t WHERE OwnerId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'PendingGrants', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM PendingGrants t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'AssetBasedPaymentRequest', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM AssetBasedPaymentRequest t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'DisbursalRequest', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM DisbursalRequest t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'FormSubmission', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM FormSubmission t WHERE Email IN (SELECT Email FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'UserStripeCustomerMapping', '0', (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM UserStripeCustomerMapping t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'UserStripeTransactionMapping', '0', (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM UserStripeTransactionMapping t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'Recommendations', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM Recommendations t WHERE UserId IN (SELECT Id FROM #TestUsers) OR UserEmail IN (SELECT Email FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'UserInvestments', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM UserInvestments t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'InvestmentRequest', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM InvestmentRequest t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'InvestmentFeedback', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM InvestmentFeedback t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'UsersNotifications', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM UsersNotifications t WHERE TargetUserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'Testimonial', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM Testimonial t WHERE UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'Requests', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM Requests t WHERE GroupToFollowId IN (SELECT Id FROM #TestGroups) OR RequestOwnerId IN (SELECT Id FROM #TestUsers) OR UserToFollowId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'LeaderGroup', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM LeaderGroup t WHERE UserId IN (SELECT Id FROM #TestUsers) OR GroupId IN (SELECT Id FROM #TestGroups);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'GroupAccountBalance', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM GroupAccountBalance t WHERE UserId IN (SELECT Id FROM #TestUsers) OR GroupId IN (SELECT Id FROM #TestGroups);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'ACHPaymentRequests', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM ACHPaymentRequests t WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'CompletedInvestmentsDetails', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM CompletedInvestmentsDetails t WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'ReturnMasters', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM ReturnMasters t WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'ReturnDetails', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM ReturnDetails t WHERE ReturnMasterId IN (SELECT Id FROM #TestReturnMasters) OR UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'ScheduledEmailLogs', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM ScheduledEmailLogs t WHERE PendingGrantId IN (SELECT Id FROM #TestPendingGrants) OR UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'AccountBalanceChangeLogs', ISNULL(CAST(Id AS VARCHAR(50)), '0'), UserId, (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM AccountBalanceChangeLogs t WHERE PendingGrantsId IN (SELECT Id FROM #TestPendingGrants) OR AssetBasedPaymentRequestId IN (SELECT Id FROM #TestAssetRequests) OR CampaignId IN (SELECT Id FROM #TestCampaigns) OR UserId IN (SELECT Id FROM #TestUsers);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'CompletedInvestmentNotes', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM CompletedInvestmentNotes t WHERE CompletedInvestmentId IN (SELECT Id FROM #TestCompletedInvestments);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'PendingGrantNotes', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM PendingGrantNotes t WHERE PendingGrantId IN (SELECT Id FROM #TestPendingGrants);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'AssetBasedPaymentRequestNotes', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM AssetBasedPaymentRequestNotes t WHERE RequestId IN (SELECT Id FROM #TestAssetRequests);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'DisbursalRequestNotes', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM DisbursalRequestNotes t WHERE DisbursalRequestId IN (SELECT Id FROM #TestDisbursalRequests);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'FormSubmissionNotes', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM FormSubmissionNotes t WHERE FormSubmissionId IN (SELECT Id FROM #TestFormSubmissions);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'InvestmentNotes', ISNULL(CAST(Id AS VARCHAR(50)), '0'), (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM InvestmentNotes t WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'InvestmentTagMapping', '0', (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM InvestmentTagMapping t WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, RecordJson, DaysOld, DeletedAt, ArchivedAt)
        SELECT 'CampaignDtoGroup', '0', (SELECT t.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), 0, GETDATE(), GETDATE()
        FROM CampaignDtoGroup t WHERE CampaignsId IN (SELECT Id FROM #TestCampaigns) OR GroupsId IN (SELECT Id FROM #TestGroups);

        DELETE FROM CompletedInvestmentNotes
        WHERE CompletedInvestmentId IN (SELECT Id FROM #TestCompletedInvestments);

        DELETE FROM ReturnDetails
        WHERE ReturnMasterId IN (SELECT Id FROM #TestReturnMasters);

        DELETE FROM PendingGrantNotes
        WHERE PendingGrantId IN (SELECT Id FROM #TestPendingGrants);

        DELETE FROM ScheduledEmailLogs
        WHERE PendingGrantId IN (SELECT Id FROM #TestPendingGrants);

        DELETE FROM AccountBalanceChangeLogs
        WHERE PendingGrantsId IN (SELECT Id FROM #TestPendingGrants);

        DELETE FROM AssetBasedPaymentRequestNotes
        WHERE RequestId IN (SELECT Id FROM #TestAssetRequests);

        DELETE FROM AccountBalanceChangeLogs
        WHERE AssetBasedPaymentRequestId IN (SELECT Id FROM #TestAssetRequests);

        DELETE FROM DisbursalRequestNotes
        WHERE DisbursalRequestId IN (SELECT Id FROM #TestDisbursalRequests);

        DELETE FROM FormSubmissionNotes
        WHERE FormSubmissionId IN (SELECT Id FROM #TestFormSubmissions);

        DELETE FROM InvestmentNotes
        WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM InvestmentTagMapping
        WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM CampaignDtoGroup
        WHERE CampaignsId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM ACHPaymentRequests
        WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM AccountBalanceChangeLogs
        WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM CompletedInvestmentsDetails
        WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM ReturnMasters
        WHERE CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM Requests
        WHERE GroupToFollowId IN (SELECT Id FROM #TestGroups);

        DELETE FROM CampaignDtoGroup
        WHERE GroupsId IN (SELECT Id FROM #TestGroups);

        DELETE FROM UserStripeCustomerMapping
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM UserStripeTransactionMapping
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM PendingGrants
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM AssetBasedPaymentRequest
        WHERE UserId IN (SELECT Id FROM #TestUsers)
           OR CampaignId IN (SELECT Id FROM #TestCampaigns);

        DELETE FROM DisbursalRequest
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM FormSubmission
        WHERE Email IN (SELECT Email FROM #TestUsers);

        DELETE FROM Recommendations
        WHERE UserId IN (SELECT Id FROM #TestUsers)
           OR UserEmail IN (SELECT Email FROM #TestUsers);

        DELETE FROM UserInvestments
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM InvestmentRequest
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM ReturnDetails
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM InvestmentFeedback
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM UsersNotifications
        WHERE TargetUserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM AccountBalanceChangeLogs
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM ScheduledEmailLogs
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM Testimonial
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM LeaderGroup
        WHERE UserId  IN (SELECT Id FROM #TestUsers)
           OR GroupId IN (SELECT Id FROM #TestGroups);

        DELETE FROM GroupAccountBalance
        WHERE UserId  IN (SELECT Id FROM #TestUsers)
           OR GroupId IN (SELECT Id FROM #TestGroups);

        UPDATE Campaigns SET GroupForPrivateAccessId = NULL
        WHERE GroupForPrivateAccessId IN (SELECT Id FROM #TestGroups)
          AND UserId NOT IN (SELECT Id FROM #TestUsers);

        DELETE FROM Groups
        WHERE OwnerId IN (SELECT Id FROM #TestUsers);

        DELETE FROM Campaigns
        WHERE UserId IN (SELECT Id FROM #TestUsers);

        DELETE FROM Requests
        WHERE RequestOwnerId IN (SELECT Id FROM #TestUsers)
           OR UserToFollowId IN (SELECT Id FROM #TestUsers);

        DELETE FROM AspNetUserRoles   WHERE UserId IN (SELECT Id FROM #TestUsers);

        DECLARE @DeletedCount INT = (SELECT COUNT(*) FROM #TestUsers);

        DELETE FROM AspNetUsers
        WHERE Id IN (SELECT Id FROM #TestUsers);

        COMMIT TRANSACTION;

        PRINT CAST(@DeletedCount AS VARCHAR(10)) + ' test user(s) deleted successfully.';

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT
            ERROR_NUMBER()  AS ErrorNumber,
            ERROR_MESSAGE() AS ErrorMessage,
            ERROR_LINE()    AS ErrorLine;
    END CATCH;

    DROP TABLE IF EXISTS #TestUsers;
    DROP TABLE IF EXISTS #TestCampaigns;
    DROP TABLE IF EXISTS #TestGroups;
    DROP TABLE IF EXISTS #TestPendingGrants;
    DROP TABLE IF EXISTS #TestDisbursalRequests;
    DROP TABLE IF EXISTS #TestAssetRequests;
    DROP TABLE IF EXISTS #TestFormSubmissions;
    DROP TABLE IF EXISTS #TestReturnMasters;
    DROP TABLE IF EXISTS #TestCompletedInvestments;
END;