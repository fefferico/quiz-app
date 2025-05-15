(async function updateQuizAttemptTimestampEnd(dbName, storeName, quizAttemptIdToUpdate, newTimestampEndDateObj) {
  if (!(newTimestampEndDateObj instanceof Date) || isNaN(newTimestampEndDateObj.getTime())) {
    console.error("Invalid newTimestampEndDateObj. It must be a valid JavaScript Date object.");
    alert("Invalid Date object provided for newTimestampEndDateObj. Check console."); // Alert for easier notice
    return;
  }
  
  const newNumericTimestamp = newTimestampEndDateObj.getTime(); // Convert Date object to numeric timestamp

  console.log(`Attempting to update timestampEnd for QuizAttempt ID: ${quizAttemptIdToUpdate} in DB: ${dbName}, Store: ${storeName} to new value: ${newNumericTimestamp} (${newTimestampEndDateObj.toISOString()})`);

  if (!window.indexedDB) {
    console.error("Your browser doesn't support IndexedDB.");
    return;
  }

  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName); 

      request.onerror = (event) => {
        console.error("Database error:", event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        console.log("Database opened successfully for update.");
        resolve(event.target.result);
      };
      
      request.onupgradeneeded = (event) => {
        console.log("Database upgrade needed (or first time setup).");
        const database = event.target.result;
        if (!database.objectStoreNames.contains(storeName)) {
           console.warn(`Object store "${storeName}" does not exist. Attempting to create it. This might not be what you want if the schema is complex.`);
           database.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
    });

    if (!db.objectStoreNames.contains(storeName)) {
        console.error(`Object store "${storeName}" does not exist in database "${dbName}". Cannot update.`);
        db.close();
        return;
    }

    const transaction = db.transaction([storeName], "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const getRequest = objectStore.get(quizAttemptIdToUpdate);

    const updateResult = await new Promise((resolve, reject) => {
      getRequest.onerror = (event) => {
        console.error("Error getting existing record:", event.target.error);
        reject(event.target.error);
      };

      getRequest.onsuccess = (event) => {
        const existingRecord = event.target.result;
        if (existingRecord) {
          console.log("Existing record found:", existingRecord);
          existingRecord.timestampEnd = newNumericTimestamp; // Update the correct field

          const updateRequest = objectStore.put(existingRecord);

          updateRequest.onerror = (event_update) => {
            console.error("Error updating record:", event_update.target.error);
            reject(event_update.target.error);
          };

          updateRequest.onsuccess = (event_update) => {
            console.log("QuizAttempt timestampEnd updated successfully. Key:", event_update.target.result);
            resolve(event_update.target.result);
          };
        } else {
          console.log(`QuizAttempt with ID "${quizAttemptIdToUpdate}" not found. Cannot update.`);
          resolve(null);
        }
      };
    });
    
    transaction.oncomplete = () => {
        console.log("Update transaction completed.");
        db.close();
    };
    transaction.onerror = (event) => {
        console.error("Update transaction error:", event.target.error);
        db.close();
    };

    return updateResult;

  } catch (error) {
    console.error("An error occurred during the update process:", error);
    return null;
  }

})('QuizAppDB', 'quizAttempts', "128cc846-1442-4370-9d31-e96e32d290ad", new Date('2025-05-14T15:00:00Z')); 
// <-- MODIFY THESE VALUES
// Example: Sets timestampEnd to 2 days ago from now. 
// Provide your desired Date object here.
// For a specific date: new Date('2023-10-25T15:00:00Z')
// To set to current time: new Date()