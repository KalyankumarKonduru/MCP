import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { Button } from '../ui/Button';
import { Upload, FileText, Loader2, Check, X } from 'lucide-react';
import { cn } from '/imports/lib/utils';

interface DocumentUploadProps {
  onUploadComplete?: (result: any) => void;
  patientName?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ 
  onUploadComplete, 
  patientName 
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string;
    type: 'info' | 'success' | 'error';
  } | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setUploadStatus({
        message: 'Invalid file type. Please upload PDF or image files.',
        type: 'error'
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setUploadStatus({
        message: 'File too large. Maximum size is 10MB.',
        type: 'error'
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus({
      message: 'Uploading document...',
      type: 'info'
    });

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);
      
      // Upload document
      const uploadResult = await Meteor.callAsync('medical.uploadDocument', {
        filename: file.name,
        content: base64,
        mimeType: file.type,
        patientName: patientName
      });

      setUploadStatus({
        message: 'Processing document...',
        type: 'info'
      });
      
      // Process document
      const processResult = await Meteor.callAsync('medical.processDocument', uploadResult.documentId);
      
      setUploadStatus({
        message: `Document processed successfully! Found ${processResult.medicalEntities.summary.diagnosisCount} diagnoses and ${processResult.medicalEntities.summary.medicationCount} medications.`,
        type: 'success'
      });
      
      if (onUploadComplete) {
        onUploadComplete({
          ...uploadResult,
          ...processResult
        });
      }

      // Add success message to chat
      await Meteor.callAsync('messages.insert', {
        content: `📄 Document "${file.name}" uploaded and processed successfully.\n\n**Summary:**\n- ${processResult.medicalEntities.summary.diagnosisCount} diagnoses found\n- ${processResult.medicalEntities.summary.medicationCount} medications identified\n- ${processResult.medicalEntities.summary.labResultCount} lab results extracted\n\nYou can now ask questions about this document.`,
        role: 'assistant',
        timestamp: new Date(),
        sessionId: uploadResult.documentId
      });

      // Clear status after 5 seconds
      setTimeout(() => {
        setUploadStatus(null);
      }, 5000);

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadStatus({
        message: error.reason || 'Failed to upload document. Please try again.',
        type: 'error'
      });
    } finally {
      setIsUploading(false);
      // Clear file input
      event.target.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Content = base64.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-md">
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleFileSelect}
        disabled={isUploading}
        className="hidden"
        id="medical-doc-upload"
      />
      <label htmlFor="medical-doc-upload">
        <Button
          variant="outline"
          size="sm"
          disabled={isUploading}
          className={cn(
            "cursor-pointer w-full",
            isUploading && "opacity-50 cursor-not-allowed"
          )}
          asChild
        >
          <span className="flex items-center justify-center">
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isUploading ? 'Processing...' : 'Upload Medical Document'}
          </span>
        </Button>
      </label>
      
      {uploadStatus && (
        <div className={cn(
          "flex items-start gap-2 p-3 rounded-md text-sm",
          uploadStatus.type === 'success' && "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200",
          uploadStatus.type === 'error' && "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200",
          uploadStatus.type === 'info' && "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200"
        )}>
          {uploadStatus.type === 'success' && <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          {uploadStatus.type === 'error' && <X className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          {uploadStatus.type === 'info' && <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <span>{uploadStatus.message}</span>
        </div>
      )}
    </div>
  );
};