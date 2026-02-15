import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Upload, Loader2 } from 'lucide-react';
import type { RagServerResults } from '@/types/rag';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { useDocuments, useUploadDocuments } from '@/hooks/useDocuments';

export function DocumentsPage() {
  const { data: documents = [] } = useDocuments();
  const uploadMutation = useUploadDocuments();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const isUploading = uploadMutation.isPending;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setSelectedFiles(fileArray);
    }
  };

  const handleUploadFiles = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Error",
        description: "Por favor selecciona al menos un archivo",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await uploadMutation.mutateAsync(selectedFiles);

      // Check for errors in the response
      const hasErrors = response.results.some((result: RagServerResults) => 'error' in result);

      if (hasErrors) {
        const errors = response.results
          .filter((result: RagServerResults) => 'error' in result)
          .map((result: RagServerResults) => `${result.filename}: ${result.status}`)
          .join(', ');

        toast({
          title: "Error en la subida",
          description: `Algunos archivos no se pudieron subir: ${errors}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Éxito",
          description: `${response.results.length} archivo(s) subido(s) correctamente`,
        });
      }

      // Clear selected files
      setSelectedFiles([]);

    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Error",
        description: "No se pudieron subir los archivos",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Documentos</h2>
          <p className="text-muted-foreground">
            Gestiona y organiza tus documentos por proyectos
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload Section */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="h-5 w-5" />
                <span>Subir Documentos</span>
              </CardTitle>
              <CardDescription>
                Selecciona archivos para subir a tu proyecto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file-upload">Archivos</Label>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <Input
                    id="file-upload"
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt,.json"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center space-y-2"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Haz clic para seleccionar archivos
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, DOCX, TXT, JSON
                    </span>
                  </label>
                </div>
              </div>

              {/* Selected files list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label>Archivos seleccionados ({selectedFiles.length})</Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="text-sm text-muted-foreground flex items-center space-x-2">
                        <FileText className="h-3 w-3" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleUploadFiles}
                disabled={selectedFiles.length === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Subir Documentos
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Documents List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Documentos</CardTitle>
              <CardDescription>
                Documentos organizados por proyecto
              </CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No hay documentos</h3>
                  <p className="text-muted-foreground text-center max-w-sm">
                    Comienza subiendo algunos documentos a tus proyectos
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4" />
                            <span>{doc.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell>{doc.created_at}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
