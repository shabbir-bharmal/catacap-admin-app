CREATE OR ALTER PROCEDURE [dbo].[sp_DailyCleanup]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RetentionDays INT;
    DECLARE @CutoffDate    DATETIME2;

    SELECT @RetentionDays = TRY_CAST([Value] AS INT)
    FROM   dbo.SiteConfiguration
    WHERE  [Type]     = 'Configuration'
      AND  [Key]      = 'Auto Delete Archived Records After (Days)'
      AND  (IsDeleted = 0 OR IsDeleted IS NULL);

    IF @RetentionDays IS NULL
    BEGIN
        RAISERROR('sp_DailyCleanup: Configuration not found in SiteConfiguration. Aborting.', 16, 1);
        RETURN;
    END;

    SET @CutoffDate = DATEADD(DAY, -@RetentionDays, SYSUTCDATETIME());

    PRINT CONCAT('Retention days : ', @RetentionDays);
    PRINT CONCAT('Cutoff date    : ', CONVERT(NVARCHAR(30), @CutoffDate, 120));
    PRINT CONCAT('Started at     : ', CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 120));

    BEGIN TRANSACTION;
    BEGIN TRY

        PRINT '-- LEVEL 5: Leaf tables --';

        EXEC dbo.sp_ArchiveAndDeleteOrphan 'PendingGrantNotes',             'PendingGrantId',        'PendingGrants',               'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'DisbursalRequestNotes',         'DisbursalRequestId',    'DisbursalRequest',            'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'AssetBasedPaymentRequestNotes', 'RequestId',             'AssetBasedPaymentRequest',    'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'FormSubmissionNotes',           'FormSubmissionId',      'FormSubmission',              'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'InvestmentNotes',               'CampaignId',            'Campaigns',                   'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'CompletedInvestmentNotes',      'CompletedInvestmentId', 'CompletedInvestmentsDetails', 'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'ACHPaymentRequests',            'CampaignId',            'Campaigns',                   'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'InvestmentTagMapping',          'CampaignId',            'Campaigns',                   'Id', @CutoffDate;
        
        DELETE cdg FROM CampaignDtoGroup cdg JOIN Campaigns c ON c.Id = cdg.CampaignsId WHERE c.DeletedAt IS NOT NULL AND c.DeletedAt <= @CutoffDate;
        
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'ReturnMasters',                 'CampaignId',            'Campaigns',                   'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete       'ScheduledEmailLogs',            'Id', 'UserId',          @CutoffDate;

        PRINT '-- LEVEL 4: AccountBalanceChangeLogs (all 3 parent FKs) --';

        EXEC dbo.sp_ArchiveAndDeleteOrphan 'AccountBalanceChangeLogs', 'AssetBasedPaymentRequestId', 'AssetBasedPaymentRequest', 'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'AccountBalanceChangeLogs', 'CampaignId',                 'Campaigns',                'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDeleteOrphan 'AccountBalanceChangeLogs', 'PendingGrantsId',            'PendingGrants',            'Id', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete       'AccountBalanceChangeLogs', 'Id', 'UserId',               @CutoffDate;

        EXEC dbo.sp_ArchiveAndDelete 'CompletedInvestmentsDetails', 'Id', NULL,     @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'ReturnDetails',               'Id', 'UserId', @CutoffDate;

        PRINT '-- LEVEL 3: Mid-level parents --';

        EXEC dbo.sp_ArchiveAndDelete 'AssetBasedPaymentRequest', 'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'DisbursalRequest',         'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'PendingGrants',            'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'Recommendations',          'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'UserInvestments',          'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'InvestmentRequest',        'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'InvestmentFeedback',       'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'Requests',                 'Id', 'RequestOwnerId', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'LeaderGroup',              'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'GroupAccountBalance',      'Id', 'UserId',         @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'FormSubmission',           'Id', NULL,             @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'UsersNotifications',       'Id', 'TargetUserId',   @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'AspNetUserRoles',          'UserId', 'UserId',     @CutoffDate;

        PRINT '-- LEVEL 2: Top-level domain parents --';

        EXEC dbo.sp_ArchiveAndDelete 'Groups',    'Id', 'OwnerId', @CutoffDate;
        EXEC dbo.sp_ArchiveAndDelete 'Campaigns', 'Id', 'UserId',  @CutoffDate;

        PRINT '-- NULLIFY: Audit FK columns referencing deleted users --';

        EXEC dbo.sp_NullifyFkColumn 'AspNetUsers',                    'DeletedBy',      @CutoffDate;

        EXEC dbo.sp_NullifyFkColumn 'Requests',                       'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Requests',                       'RequestOwnerId', @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Requests',                       'UserToFollowId', @CutoffDate;

        EXEC dbo.sp_NullifyFkColumn 'AccountBalanceChangeLogs',       'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'ApprovedBy',                     'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'AssetBasedPaymentRequest',       'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'AssetBasedPaymentRequest',       'UpdatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Campaigns',                      'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'CataCapTeam',                    'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'CataCapTeam',                    'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'CataCapTeam',                    'ModifiedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'CompletedInvestmentsDetails',    'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'CompletedInvestmentsDetails',    'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'DisbursalRequest',               'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'EmailTemplate',                  'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Event',                          'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Event',                          'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Event',                          'ModifiedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Faq',                            'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'FormSubmission',                 'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'GroupAccountBalance',            'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Groups',                         'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'InvestmentFeedback',             'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'InvestmentRequest',              'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'InvestmentRequest',              'ModifiedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'InvestmentTag',                  'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'LeaderGroup',                    'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'ModuleAccessPermission',         'UpdatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'News',                           'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'PendingGrants',                  'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'PendingGrants',                  'RejectedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Recommendations',                'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Recommendations',                'RejectedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'ReturnDetails',                  'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'ReturnMasters',                  'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'ScheduledEmailLogs',             'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'SiteConfiguration',              'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Testimonial',                    'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Themes',                         'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'UserInvestments',                'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'UsersNotifications',             'DeletedBy',      @CutoffDate;

        EXEC dbo.sp_NullifyFkColumn 'AssetBasedPaymentRequestNotes',  'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'CompletedInvestmentNotes',       'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'DisbursalRequestNotes',          'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'FormSubmissionNotes',            'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'InvestmentNotes',                'CreatedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'PendingGrantNotes',              'CreatedBy',      @CutoffDate;

        PRINT '-- LEVEL 1: Root --';

        EXEC dbo.sp_ArchiveAndDelete 'AspNetUsers', 'Id', 'Id', @CutoffDate;

        COMMIT TRANSACTION;
        PRINT CONCAT('Cleanup finished at ', CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 120));

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrMsg  NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrLine INT            = ERROR_LINE();
        RAISERROR('sp_DailyCleanup FAILED at line %d: %s', 16, 1, @ErrLine, @ErrMsg);
    END CATCH;
END;