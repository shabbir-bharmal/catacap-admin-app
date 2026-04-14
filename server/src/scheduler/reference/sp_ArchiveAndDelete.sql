CREATE OR ALTER PROCEDURE [dbo].[sp_ArchiveAndDelete]
    @TableName    NVARCHAR(128),
    @PkColumn     NVARCHAR(128),
    @UserIdColumn NVARCHAR(128),
    @CutoffDate   DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME   = @TableName
          AND COLUMN_NAME  = 'DeletedAt'
    )
    BEGIN
        PRINT CONCAT('  SKIP (no DeletedAt): ', @TableName);
        RETURN;
    END;

    DECLARE @SQL      NVARCHAR(MAX);
    DECLARE @RowCount INT;

    -- Archive rows not already archived today
    SET @SQL = N'
    INSERT INTO dbo.ArchivedUserData
        (SourceTable, RecordId, UserId, DeletedAt, DaysOld, RecordJson)
    SELECT
        @tbl,
        CAST(' + QUOTENAME(@PkColumn) + N' AS NVARCHAR(256)),
        ' + CASE WHEN @UserIdColumn IS NOT NULL
                 THEN 'CAST(' + QUOTENAME(@UserIdColumn) + N' AS NVARCHAR(450))'
                 ELSE 'NULL'
            END + N',
        DeletedAt,
        DATEDIFF(DAY, DeletedAt, SYSUTCDATETIME()),
        (
            SELECT src.*
            FROM ' + QUOTENAME(@TableName) + N' src
            WHERE src.' + QUOTENAME(@PkColumn) + N' = t.' + QUOTENAME(@PkColumn) + N'
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM ' + QUOTENAME(@TableName) + N' t
    WHERE DeletedAt IS NOT NULL
      AND DeletedAt <= @cutoff
      AND NOT EXISTS (
          SELECT 1 FROM dbo.ArchivedUserData a
          WHERE a.SourceTable = @tbl
            AND a.RecordId    = CAST(t.' + QUOTENAME(@PkColumn) + N' AS NVARCHAR(256))
            AND CAST(a.ArchivedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
      );';

    EXEC sp_executesql @SQL,
         N'@tbl NVARCHAR(128), @cutoff DATETIME2',
         @tbl = @TableName, @cutoff = @CutoffDate;

    SET @RowCount = @@ROWCOUNT;

    SET @SQL = N'
    DELETE FROM ' + QUOTENAME(@TableName) + N'
    WHERE DeletedAt IS NOT NULL
      AND DeletedAt <= @cutoff;';

    EXEC sp_executesql @SQL,
         N'@cutoff DATETIME2',
         @cutoff = @CutoffDate;

    PRINT CONCAT('  ', @TableName, ': archived & deleted ', @RowCount, ' row(s)');
END;