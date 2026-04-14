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

    -- Pre-flight: count qualifying users
    DECLARE @QualifyingUsers INT;
    SELECT @QualifyingUsers = COUNT(*) FROM dbo.AspNetUsers WHERE DeletedAt IS NOT NULL AND DeletedAt <= @CutoffDate;
    PRINT CONCAT('Qualifying users for deletion: ', @QualifyingUsers);

    IF @QualifyingUsers = 0
    BEGIN
        PRINT 'No users qualify for deletion. Exiting early.';
        RETURN;
    END;

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
        PRINT '-- NOTE: ModuleAccessPermission.UpdatedBy, ReturnMasters.CreatedBy, and';
        PRINT '-- CompletedInvestmentsDetails.CreatedBy are NOT NULL columns without FK';
        PRINT '-- constraints to users — they are NOT nullified (would cause constraint violation).';

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
        -- REMOVED: CompletedInvestmentsDetails.CreatedBy — NOT NULL, no FK to users
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
        -- REMOVED: ModuleAccessPermission.UpdatedBy — NOT NULL, no FK to users
        EXEC dbo.sp_NullifyFkColumn 'News',                           'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'PendingGrants',                  'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'PendingGrants',                  'RejectedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Recommendations',                'DeletedBy',      @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'Recommendations',                'RejectedBy',     @CutoffDate;
        EXEC dbo.sp_NullifyFkColumn 'ReturnDetails',                  'DeletedBy',      @CutoffDate;
        -- REMOVED: ReturnMasters.CreatedBy — NOT NULL, no FK to users
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

        PRINT '-- FK RESOLUTION: Remove non-deleted records blocking user deletion --';
        PRINT '-- Campaigns.UserId and GroupAccountBalance.UserId have FK constraints to Users(Id). --';
        PRINT '-- Non-deleted records referencing deleted users must be cleaned up first. --';

        -- Archive and clean children of campaigns owned by users being deleted (deepest first)

        -- CompletedInvestmentNotes via CompletedInvestmentsDetails → Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'CompletedInvestmentNotes', CAST(cn.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM CompletedInvestmentNotes src WHERE src.Id = cn.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM CompletedInvestmentNotes cn
        JOIN CompletedInvestmentsDetails cid ON cid.Id = cn.CompletedInvestmentId
        JOIN Campaigns cam ON cam.Id = cid.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'CompletedInvestmentNotes' AND a.RecordId = CAST(cn.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE cn FROM CompletedInvestmentNotes cn
          JOIN CompletedInvestmentsDetails cid ON cid.Id = cn.CompletedInvestmentId
          JOIN Campaigns cam ON cam.Id = cid.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- InvestmentNotes via Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'InvestmentNotes', CAST(n.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM InvestmentNotes src WHERE src.Id = n.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM InvestmentNotes n
        JOIN Campaigns cam ON cam.Id = n.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'InvestmentNotes' AND a.RecordId = CAST(n.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE n FROM InvestmentNotes n
          JOIN Campaigns cam ON cam.Id = n.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- ACHPaymentRequests via Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'ACHPaymentRequests', CAST(a2.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM ACHPaymentRequests src WHERE src.Id = a2.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM ACHPaymentRequests a2
        JOIN Campaigns cam ON cam.Id = a2.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'ACHPaymentRequests' AND a.RecordId = CAST(a2.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE a FROM ACHPaymentRequests a
          JOIN Campaigns cam ON cam.Id = a.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- InvestmentTagMapping via Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'InvestmentTagMapping', CAST(itm.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM InvestmentTagMapping src WHERE src.Id = itm.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM InvestmentTagMapping itm
        JOIN Campaigns cam ON cam.Id = itm.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'InvestmentTagMapping' AND a.RecordId = CAST(itm.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE itm FROM InvestmentTagMapping itm
          JOIN Campaigns cam ON cam.Id = itm.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- CampaignDtoGroup (no Id PK, composite key — archive not applicable)
        DELETE cdg FROM CampaignDtoGroup cdg
          JOIN Campaigns cam ON cam.Id = cdg.CampaignsId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- ReturnMasters via Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'ReturnMasters', CAST(rm.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM ReturnMasters src WHERE src.Id = rm.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM ReturnMasters rm
        JOIN Campaigns cam ON cam.Id = rm.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'ReturnMasters' AND a.RecordId = CAST(rm.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE rm FROM ReturnMasters rm
          JOIN Campaigns cam ON cam.Id = rm.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- CompletedInvestmentsDetails via Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'CompletedInvestmentsDetails', CAST(cid.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM CompletedInvestmentsDetails src WHERE src.Id = cid.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM CompletedInvestmentsDetails cid
        JOIN Campaigns cam ON cam.Id = cid.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'CompletedInvestmentsDetails' AND a.RecordId = CAST(cid.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE cid FROM CompletedInvestmentsDetails cid
          JOIN Campaigns cam ON cam.Id = cid.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- AccountBalanceChangeLogs via Campaigns → Users
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'AccountBalanceChangeLogs', CAST(abcl.Id AS NVARCHAR(256)), NULL, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM AccountBalanceChangeLogs src WHERE src.Id = abcl.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM AccountBalanceChangeLogs abcl
        JOIN Campaigns cam ON cam.Id = abcl.CampaignId
        JOIN AspNetUsers u ON u.Id = cam.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'AccountBalanceChangeLogs' AND a.RecordId = CAST(abcl.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE abcl FROM AccountBalanceChangeLogs abcl
          JOIN Campaigns cam ON cam.Id = abcl.CampaignId
          JOIN AspNetUsers u ON u.Id = cam.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- Archive and delete campaigns owned by users being deleted
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'Campaigns', CAST(c.Id AS NVARCHAR(256)), c.UserId, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM Campaigns src WHERE src.Id = c.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM Campaigns c
        JOIN AspNetUsers u ON u.Id = c.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'Campaigns' AND a.RecordId = CAST(c.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE c FROM Campaigns c
          JOIN AspNetUsers u ON u.Id = c.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

        -- Archive and delete group_account_balances owned by users being deleted
        INSERT INTO dbo.ArchivedUserData (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
        SELECT 'GroupAccountBalance', CAST(g.Id AS NVARCHAR(256)), g.UserId, u.DeletedAt,
               DATEDIFF(DAY, u.DeletedAt, SYSUTCDATETIME()),
               (SELECT src.* FROM GroupAccountBalance src WHERE src.Id = g.Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM GroupAccountBalance g
        JOIN AspNetUsers u ON u.Id = g.UserId AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ArchivedUserData a
            WHERE a.SourceTable = 'GroupAccountBalance' AND a.RecordId = CAST(g.Id AS NVARCHAR(256))
              AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
        );
        DELETE g FROM GroupAccountBalance g
          JOIN AspNetUsers u ON u.Id = g.UserId
          AND u.DeletedAt IS NOT NULL AND u.DeletedAt <= @CutoffDate;

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
