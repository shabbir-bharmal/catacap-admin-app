CREATE OR ALTER PROCEDURE [dbo].[sp_ArchiveAndDeleteOrphan]
    @ChildTable   NVARCHAR(128),
    @FkColumn     NVARCHAR(128),
    @ParentTable  NVARCHAR(128),
    @ParentPkCol  NVARCHAR(128) = 'Id',
    @CutoffDate   DATETIME2,
    @PkColumn     NVARCHAR(128) = 'Id'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL      NVARCHAR(MAX);
    DECLARE @RowCount INT;

    SET @SQL = N'
    INSERT INTO dbo.ArchivedUserData
        (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
    SELECT
        @child,
        CAST(c.' + QUOTENAME(@PkColumn) + N' AS NVARCHAR(256)),
        NULL,
        p.DeletedAt,
        DATEDIFF(DAY, p.DeletedAt, SYSUTCDATETIME()),
        (
            SELECT src.*
            FROM ' + QUOTENAME(@ChildTable) + N' src
            WHERE src.' + QUOTENAME(@PkColumn) + N' = c.' + QUOTENAME(@PkColumn) + N'
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM ' + QUOTENAME(@ChildTable) + N' c
    JOIN ' + QUOTENAME(@ParentTable) + N' p
         ON  p.' + QUOTENAME(@ParentPkCol) + N' = c.' + QUOTENAME(@FkColumn) + N'
         AND p.DeletedAt  IS NOT NULL
         AND p.DeletedAt  <= @cutoff
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.ArchivedUserData a
        WHERE a.SourceTable = @child
          AND a.RecordId    = CAST(c.' + QUOTENAME(@PkColumn) + N' AS NVARCHAR(256))
          AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
    );';

    EXEC sp_executesql @SQL,
         N'@child NVARCHAR(128), @cutoff DATETIME2',
         @child = @ChildTable, @cutoff = @CutoffDate;

    SET @RowCount = @@ROWCOUNT;

    -- Hard delete
    SET @SQL = N'
    DELETE c
    FROM ' + QUOTENAME(@ChildTable) + N' c
    JOIN ' + QUOTENAME(@ParentTable) + N' p
         ON  p.' + QUOTENAME(@ParentPkCol) + N' = c.' + QUOTENAME(@FkColumn) + N'
         AND p.DeletedAt  IS NOT NULL
         AND p.DeletedAt  <= @cutoff;';

    EXEC sp_executesql @SQL,
         N'@cutoff DATETIME2',
         @cutoff = @CutoffDate;

    PRINT CONCAT('  ', @ChildTable, ' (orphan): archived & deleted ', @RowCount, ' row(s)');
END;