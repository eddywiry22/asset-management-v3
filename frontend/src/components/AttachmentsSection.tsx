import React, { useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
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
  TextField,
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

function userLabel(u: { username: string } | null | undefined): string {
  if (!u) return '—';
  return u.username;
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
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading]         = useState(false);
  const [deleting, setDeleting]           = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);
  const [previewName, setPreviewName]     = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [collapsed, setCollapsed]         = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'info' } | null>(null);

  // Upload modal state
  const [modalOpen, setModalOpen]           = useState(false);
  const [pendingFiles, setPendingFiles]     = useState<File[]>([]);
  const [descriptionMap, setDescriptionMap] = useState<Record<string, string>>({});

  const isDraft = requestStatus === 'DRAFT';

  const queryKey = ['attachments', entityType, entityId];

  const { data: rawAttachments = [], isLoading } = useQuery<Attachment[]>({
    queryKey,
    queryFn: () => attachmentsService.list(entityType, entityId),
    enabled: !!entityId,
  });

  const attachments = [...rawAttachments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const openUploadModal = () => {
    setPendingFiles([]);
    setDescriptionMap({});
    setModalOpen(true);
  };

  const closeUploadModal = () => {
    setModalOpen(false);
    setPendingFiles([]);
    setDescriptionMap({});
    if (modalFileInputRef.current) modalFileInputRef.current.value = '';
  };

  const handleModalFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected: File[] = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const invalid = selected.filter((f) => !ALLOWED_TYPES.includes(f.type));
    if (invalid.length > 0) {
      setSnack({ msg: `Invalid file type(s): ${invalid.map((f) => f.name).join(', ')}. Allowed: JPG, PNG, PDF.`, severity: 'error' });
      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
      return;
    }

    const tooLarge = selected.filter((f) => f.size > MAX_SIZE_BYTES);
    if (tooLarge.length > 0) {
      setSnack({ msg: `File(s) exceed 5 MB: ${tooLarge.map((f) => f.name).join(', ')}.`, severity: 'error' });
      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
      return;
    }

    setPendingFiles(selected);
    setDescriptionMap({});
  };

  const handleDescriptionChange = (fileName: string, value: string) => {
    setDescriptionMap((prev) => ({ ...prev, [fileName]: value }));
  };

  const handleModalUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    try {
      await attachmentsService.upload(entityType, entityId, pendingFiles, descriptionMap);
      refresh();
      setSnack({ msg: `${pendingFiles.length} file(s) uploaded successfully.`, severity: 'success' });
      closeUploadModal();
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.error?.message ?? 'Upload failed.', severity: 'error' });
    } finally {
      setUploading(false);
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
              startIcon={<CloudUploadIcon />}
              onClick={openUploadModal}
            >
              Upload
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

      {!collapsed && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Filename</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Uploaded By</TableCell>
                  <TableCell>Uploaded At</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && attachments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
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
                    <TableCell sx={{ color: 'text.secondary', maxWidth: 200 }}>
                      <Typography variant="body2" noWrap title={att.description ?? undefined}>
                        {att.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{userLabel(att.uploadedBy)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(att.createdAt)}</TableCell>
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

      {/* Upload Modal */}
      <Dialog open={modalOpen} onClose={closeUploadModal} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Upload Attachments
          <IconButton size="small" onClick={closeUploadModal}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Button
            component="label"
            variant="outlined"
            startIcon={<CloudUploadIcon />}
            size="small"
            sx={{ mb: 2 }}
          >
            Select Files
            <input
              ref={modalFileInputRef}
              type="file"
              hidden
              multiple
              accept={ALLOWED_EXT}
              onChange={handleModalFilesSelected}
            />
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            JPG, PNG, PDF · Max 5 MB per file
          </Typography>

          {pendingFiles.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No files selected yet.
            </Typography>
          )}

          {pendingFiles.map((file) => (
            <Box key={file.name} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                {ALLOWED_TYPES.includes(file.type) && file.type !== 'application/pdf' ? (
                  <ImageIcon fontSize="small" sx={{ color: 'primary.main' }} />
                ) : (
                  <AttachFileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                )}
                <Typography variant="body2" fontWeight={500}>{file.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  ({fmtSize(file.size)})
                </Typography>
              </Box>
              <TextField
                placeholder="Add description (optional)"
                helperText="Describe the file to provide context (e.g. signed invoice, damaged item photo)"
                fullWidth
                size="small"
                value={descriptionMap[file.name] || ''}
                onChange={(e) => handleDescriptionChange(file.name, e.target.value)}
              />
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUploadModal} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleModalUpload}
            disabled={pendingFiles.length === 0 || uploading}
            startIcon={uploading ? <CircularProgress size={14} /> : <CloudUploadIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

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
