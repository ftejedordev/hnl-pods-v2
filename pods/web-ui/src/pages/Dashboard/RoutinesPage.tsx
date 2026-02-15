import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RotateCw, Plus, Clock } from 'lucide-react';

export function RoutinesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rutinas</h2>
          <p className="text-muted-foreground">
            Automatiza tareas recurrentes con rutinas programadas
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Crear Rutina
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Rutinas Programadas</span>
            </CardTitle>
            <CardDescription>
              Tareas que se ejecutan automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">0</div>
              <p className="text-sm text-muted-foreground">Rutinas activas</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RotateCw className="h-5 w-5" />
              <span>Ejecuciones</span>
            </CardTitle>
            <CardDescription>
              Total de ejecuciones este mes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">0</div>
              <p className="text-sm text-muted-foreground">Ejecuciones</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Próxima Ejecución</span>
            </CardTitle>
            <CardDescription>
              Siguiente rutina programada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-lg font-medium text-muted-foreground">-</div>
              <p className="text-sm text-muted-foreground">No hay rutinas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <RotateCw className="h-12 w-12 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No hay rutinas configuradas</CardTitle>
          <CardDescription className="text-center max-w-sm mb-4">
            Las rutinas te permiten automatizar tareas recurrentes como procesamiento de documentos, 
            envío de reportes, o sincronización de datos.
          </CardDescription>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Crear primera rutina
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}