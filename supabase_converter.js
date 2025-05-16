const fs = require('fs'); // Node.js File System module
const path = require('path'); // Node.js Path module

// The function from the previous example
function jsArrayToSupabaseBulkInsertSQL(tableName, dataArray) {
  if (!dataArray || dataArray.length === 0) {
    return "-- No data to insert";
  }
  const columns = Object.keys(dataArray[0]);

  function formatValue(value) {
    if (value === null || typeof value === 'undefined') {
      return 'NULL';
    }
    if (typeof value === 'string') {
      return "'" + value.replace(/'/g, "''") + "'";
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value instanceof Date) {
      return "'" + value.toISOString() + "'";
    }
    if (Array.isArray(value)) {
      return `ARRAY[${value.map(el => formatValue(el)).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) { // Check for null explicitly
      return "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
    }
    return value;
  }

  const columnNamesSQL = columns.map(col => `"${col}"`).join(', '); // Quote column names for safety

  const valueStrings = dataArray.map(obj => {
    const rowValues = columns.map(col => formatValue(obj[col]));
    return `(${rowValues.join(', ')})`;
  });

  const valuesSQL = valueStrings.join(',\n  ');

  return `INSERT INTO "${tableName}" (${columnNamesSQL})\nVALUES\n  ${valuesSQL};`;
}


// --- Main script logic ---
function main() {
  const args = process.argv.slice(2); // Get command line arguments, excluding 'node' and script name

  if (args.length < 2) {
    console.error("Usage: node generate-insert.js <path_to_data_file> <table_name>");
    console.error("Example (JSON): node generate-insert.js ./data.json products");
    console.error("Example (JS):   node generate-insert.js ./data.js products");
    process.exit(1); // Exit with an error code
  }

  const dataFilePath = args[0];
  const tableName = args[1];
  let dataArray;

  try {
    const absolutePath = path.resolve(dataFilePath); // Get absolute path
    console.log(`Reading data from: ${absolutePath}`);

    if (!fs.existsSync(absolutePath)) {
        console.error(`Error: Data file not found at ${absolutePath}`);
        process.exit(1);
    }

    const fileExtension = path.extname(absolutePath).toLowerCase();

    if (fileExtension === '.json') {
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      dataArray = JSON.parse(fileContent);
    } else if (fileExtension === '.js') {
      dataArray = require(absolutePath); // For CommonJS modules
      // If data.js uses ES Modules (export default), you'd need to run Node.js
      // with ES module support (e.g., .mjs extension or "type": "module" in package.json)
      // and use dynamic import:
      // (async () => {
      //   const module = await import(`file://${absolutePath}`); // Note: file:// protocol
      //   dataArray = module.default;
      //   // ... then proceed with SQL generation ...
      // })();
      // This async nature would require restructuring the main function a bit.
      // For simplicity, this example sticks to `require`.
    } else {
      console.error("Error: Unsupported data file format. Please use .json or .js");
      process.exit(1);
    }

    if (!Array.isArray(dataArray)) {
        console.error("Error: The data file did not resolve to an array.");
        process.exit(1);
    }

    const sqlStatement = jsArrayToSupabaseBulkInsertSQL(tableName, dataArray);
    console.log("\n--- Generated SQL Statement ---");
    // console.log(sqlStatement);
    console.log("\n--- End of SQL Statement ---");

    // Split the data into 6 balanced chunks
    const chunkCount = 6;
    const chunkSize = Math.ceil(dataArray.length / chunkCount);

    for (let i = 0; i < chunkCount; i++) {
      const chunkData = dataArray.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunkData.length === 0) continue;
      const chunkSQL = jsArrayToSupabaseBulkInsertSQL(tableName, chunkData);
      const fileName = `result_${i + 1}.txt`;
      fs.writeFileSync(fileName, chunkSQL, 'utf8');
      console.log(`SQL statement written to ${fileName}`);
    }

    // Optional: Write to an output file
    // fs.writeFileSync('./output.sql', sqlStatement, 'utf8');
    // console.log("\nSQL statement also written to output.sql");

  } catch (error) {
    console.error("An error occurred:", error.message);
    process.exit(1);
  }
}

main();