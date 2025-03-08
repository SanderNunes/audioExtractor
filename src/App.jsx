import React, { useState } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const AudioList = () => {
  const [groupedData, setGroupedData] = useState({});
  const [parsingStatus, setParsingStatus] = useState("");
  const [transcriptions, setTranscriptions] = useState({});

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setParsingStatus("Parsing CSV file...");

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        encoding: "UTF-8",
        transformHeader: (header) => header.trim(),
        error: (error) => {
          console.error("Error parsing CSV:", error);
          setParsingStatus(`Error parsing CSV: ${error.message}`);
        },
        complete: (result) => {
          if (result.data.length > 0) {
            const audioColumns = [];
            const allColumns = Object.keys(result.data[0] || {});
            const knownAudioQuestions = [
              "Nao Porque",
              "Sim Porque",
              "O que a Africell poderia fazer para conquistar voce como cliente",
              "O que voce acha das publicidades da Africell",
              "Onde voce ja viu ou ouviu anuncios da Africell",
              "InterestedReward",
            ];

            knownAudioQuestions.forEach((col) => {
              if (allColumns.includes(col)) {
                audioColumns.push(col);
              }
            });

            allColumns.forEach((column) => {
              if (!audioColumns.includes(column)) {
                const hasAudioData = result.data.some(
                  (row) =>
                    row[column] &&
                    typeof row[column] === "string" &&
                    (row[column].includes("base64") ||
                      row[column].startsWith("data:audio"))
                );
                if (hasAudioData) audioColumns.push(column);
              }
            });

            const grouped = {};
            result.data.forEach((row, rowIndex) => {
              const createdBy =
                row["Created By"] ||
                row["CreatedBy"] ||
                row["User"] ||
                row["UserID"] ||
                row["Name"] ||
                row["ID"] ||
                "Unknown";
              if (!grouped[createdBy]) {
                grouped[createdBy] = {};
              }

              const rowID = row["ID"] || `Row_${rowIndex + 1}`;
              if (!grouped[createdBy][rowID]) {
                grouped[createdBy][rowID] = { audio: [], nonAudio: {} };
              }

              audioColumns.forEach((question) => {
                if (
                  row[question] &&
                  typeof row[question] === "string" &&
                  row[question].includes("base64")
                ) {
                  let audioData = row[question];
                  if (!audioData.startsWith("data:")) {
                    audioData = "data:audio/mp3;base64," + audioData;
                  }
                  grouped[createdBy][rowID].audio.push({
                    question,
                    audio: audioData,
                  });
                }
              });

              Object.keys(row).forEach((key) => {
                if (!audioColumns.includes(key)) {
                  grouped[createdBy][rowID].nonAudio[key] = row[key];
                }
              });
            });

            setGroupedData(grouped);
            setParsingStatus("CSV processing complete.");
          } else {
            setParsingStatus("The CSV file appears to be empty.");
          }
        },
      });
    }
  };

  const transcribeAudio = (audioSrc, rowID) => {
    const recognition = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    recognition.lang = "pt-BR";
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTranscriptions((prev) => ({ ...prev, [rowID]: transcript }));
    };
    recognition.onerror = (event) => {
      console.error("Transcription error:", event.error);
    };

    const audio = new Audio(audioSrc);
    audio.onloadedmetadata = () => {
      recognition.start();
      audio.play();
    };
  };

  const downloadAllAsZip = () => {
    const zip = new JSZip();
    const nonAudioResponses = [];

    Object.entries(groupedData).forEach(([createdBy, rows]) => {
      const userFolder = zip.folder(createdBy);

      Object.entries(rows).forEach(([rowID, data]) => {
        const rowFolder = userFolder.folder(rowID);
        const nonAudioRow = {
          User: createdBy,
          "Row ID": rowID,
          ...data.nonAudio,
        };

        data.audio.forEach((row, index) => {
          const base64Data = row.audio.split(",")[1];
          const binaryData = atob(base64Data);
          const bytes = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            bytes[i] = binaryData.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: "audio/mp3" });
          rowFolder.file(`${row.question.substring(0, 20)}_${index}.mp3`, blob);
        });

        nonAudioResponses.push(nonAudioRow);
      });
    });

    const csvContent = Papa.unparse(nonAudioResponses);
    zip.file("Non_Audio_Responses.csv", csvContent);

    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "All_Audios_and_Responses.zip");
    });
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1>Audio Extractor for CSV Files</h1>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        style={{ marginBottom: "15px" }}
      />
      {parsingStatus && <div>{parsingStatus}</div>}
      {Object.keys(groupedData).length > 0 && (
        <>
          <button
            onClick={downloadAllAsZip}
            style={{
              marginBottom: "15px",
              padding: "10px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            📁 Download All
          </button>
          {Object.entries(groupedData).map(([createdBy, rows]) => (
            <div key={createdBy}>
              <h2>Responses from: {createdBy}</h2>
              {Object.entries(rows).map(([rowID, data]) => (
                <div
                  key={rowID}
                  style={{
                    marginBottom: "20px",
                    padding: "10px",
                    border: "1px solid #ddd",
                  }}
                >
                  <h3>Row: {rowID}</h3>
                  <ul>
                    {data.audio.map((row, index) => (
                      <li key={index}>
                        {row.question}
                        {transcriptions[rowID] && (
                          <p>Transcription: {transcriptions[rowID]}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default AudioList;
