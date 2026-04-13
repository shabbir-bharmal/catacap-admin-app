CREATE OR ALTER PROCEDURE [dbo].[sp_NullifyFkColumn]
    @ChildTable  NVARCHAR(128),
    @FkColumn    NVARCHAR(128),
    @CutoffDate  DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(MAX);

    SET @SQL = N'
    UPDATE c
    SET    c.' + QUOTENAME(@FkColumn) + N' = NULL
    FROM   ' + QUOTENAME(@ChildTable) + N' c
    JOIN   dbo.AspNetUsers u
           ON  u.Id        = c.' + QUOTENAME(@FkColumn) + N'
           AND u.DeletedAt IS NOT NULL
           AND u.DeletedAt <= @cutoff;';

    EXEC sp_executesql @SQL,
         N'@cutoff DATETIME2',
         @cutoff = @CutoffDate;

    PRINT CONCAT('  ', @ChildTable, '.', @FkColumn, ' → nullified ', @@ROWCOUNT, ' row(s)');
END;