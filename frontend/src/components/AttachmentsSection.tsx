import React, { useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ImageIcon from '@mui/icons-material/Image';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import attachmentsService, { Attachment } from '../services/attachments.service';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_EXT  = '.jpg,.jpeg,.png,.pdf';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function userLabel(u: { email: string | null; phone: string | null } | null | undefined): string {
  if (!u) return '—';
  return u.email ?? u.phone ?? '(unknown)';
}

function isImage(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png';
}

interface AttachmentsSectionProps {
  entityType: string;
  entityId: string;
  isAdmin: boolean;
  requestStatus: string;
}

export default function AttachmentsSection({
  entityType,
  entityId,
  isAdmin,
  requestStatus,
}: AttachmentsSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading]         = useState(false);
  const [deleting, setDeleting]           = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);
  const [previewName, setPreviewName]     = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [collapsed, setCollapsed]         = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'info' } | null>(null);

  const isDraft = requestStatus === 'DRAFT';

  const queryKey = ['attachments', entityType, entityId];

  const { data: rawAttachments = [], isLoading } = useQuery<Attachment[]>({
    queryKey,
    queryFn: () => attachmentsService.list(entityType, entityId),
    enabled: !!entityId,
  });

  const attachments = [...rawAttachments].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected: File[] = Array.from(e.target.files ?? ([] as File[]));
    if (selected.length === 0) return;

    const invalid = selected.filter((f: File) => !ALLOWED_TYPES.includes(f.type));
    if (invalid.length > 0) {
      setSnack({ msg: `Invalid file type(s): ${invalid.map((f: File) => f.name).join(', ')}. Allowed: JPG, PNG, PDF.`, severity: 'error' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const tooLarge = selected.filter((f: File) => f.size > MAX_SIZE_BYTES);
    if (tooLarge.length > 0) {
      setSnack({ msg: `File(s) exceed 5 MB: ${tooLarge.map((f: File) => f.name).join(', ')}.`, severity: 'error' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      await attachmentsService.upload(entityType, entityId, selected);
      refresh();
      setSnack({ msg: `${selected.length} file(s) uploaded successfully.`, severity: 'success' });
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.error?.message ?? 'Upload failed.', severity: 'error' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      await attachmentsService.download(att.id, att.fileName);
    } catch {
      setSnack({ msg: 'Download failed.', severity: 'error' });
    }
  };

  const handlePreview = async (att: Attachment) => {
    if (!isImage(att.mimeType)) {
      // PDFs: open download endpoint directly in new tab (browser will render PDF natively)
      // We use a programmatic click via an anchor to avoid popup blockers
      try {
        setPreviewLoading(true);
        const blobUrl = await attachmentsService.getPreviewBlob(att.id);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke after a short delay so the tab has time to load
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
      } catch {
        setSnack({ msg: 'Failed to open file.', severity: 'error' });
      } finally {
        setPreviewLoading(false);
      }
      return;
    }
    setPreviewLoading(true);
    try {
      const url = await attachmentsService.getPreviewBlob(att.id);
      setPreviewName(att.fileName);
      setPreviewUrl(url);
    } catch {
      setSnack({ msg: 'Failed to load preview.', severity: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewName('');
  };

  const handleDelete = async (att: Attachment) => {
    if (!window.confirm(`Delete "${att.fileName}"?`)) return;
    setDeleting(att.id);
    try {
      await attachmentsService.delete(att.id);
      refresh();
      setSnack({ msg: 'Attachment deleted.', severity: 'success' });
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.error?.message ?? 'Delete failed.', severity: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      {/* Section header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">Attachments</Typography>
          {attachments.length > 0 && (
            <Badge badgeContent={attachments.length} color="primary">
              <AttachFileIcon fontSize="small" />
            </Badge>
          )}
          <Chip
            label={attachments.length === 0 ? 'None' : `${attachments.length} file${attachments.length > 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={uploading ? <CircularProgress size={14} /> : <CloudUploadIcon />}
              onClick={handleUploadClick}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
              JPG, PNG, PDF · Max 5 MB · Up to 5 files
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        </Box>
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_EXT}
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      {!collapsed && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Filename</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Uploaded By</TableCell>
                  <TableCell>Uploaded At</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && attachments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        No attachments yet. Upload files to support this request.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {attachments.map((att) => (
                  <TableRow key={att.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isImage(att.mimeType) ? (
                          <ImageIcon fontSize="small" sx={{ color: 'primary.main' }} />
                        ) : (
                          <AttachFileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        )}
                        <Typography variant="body2">{att.fileName}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {fmtSize(att.fileSize)}
                    </TableCell>
                    <TableCell>{userLabel(att.uploadedBy)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(att.uploadedAt)}</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title={isImage(att.mimeType) ? 'Preview' : 'Open in new tab'}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handlePreview(att)}
                            disabled={previewLoading}
                          >
                            {isImage(att.mimeType) ? (
                              <ImageIcon fontSize="small" />
                            ) : (
                              <OpenInNewIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Download">
                        <IconButton size="small" onClick={() => handleDownload(att)}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isAdmin && isDraft && (
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(att)}
                              disabled={deleting === att.id}
                            >
                              {deleting === att.id ? (
                                <CircularProgress size={14} />
                              ) : (
                                <DeleteIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!previewUrl} onClose={closePreview} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" noWrap sx={{ maxWidth: '90%' }}>{previewName}</Typography>
          <IconButton size="small" onClick={closePreview}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 1, textAlign: 'center', bgcolor: '#000' }}>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={previewName}
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity ?? 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
