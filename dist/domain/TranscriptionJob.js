/**
 * TranscriptionJobState describes where a TranscriptionJob is in its lifecycle.
 */
export var TranscriptionJobState;
(function (TranscriptionJobState) {
    TranscriptionJobState["Pending"] = "pending";
    TranscriptionJobState["InProgress"] = "in_progress";
    TranscriptionJobState["Completed"] = "completed";
    TranscriptionJobState["Failed"] = "failed";
})(TranscriptionJobState || (TranscriptionJobState = {}));
