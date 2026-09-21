import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/charts/geometry";
import type { BucketLabel, ChartUnit, DistributionSlice, SeriesInfo } from "@/lib/charts/types";

/**
 * Tabellenansicht als gleichwertiger Ersatz für das Diagramm: dieselben Werte als Text – für Screenreader, zum Kopieren
 * und überall dort, wo Farben oder Formen nicht taugen. Jedes Diagramm hat eine solche Ansicht.
 */
export function TimeTable({
  caption,
  buckets,
  series,
  values,
  unit,
}: {
  caption: string;
  buckets: BucketLabel[];
  series: SeriesInfo[];
  values: number[][];
  unit: ChartUnit;
}) {
  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Zeitraum</TableHead>
          {series.map((s) => (
            <TableHead key={s.id} scope="col" className="text-right">
              {s.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {buckets.map((bucket, index) => (
          <TableRow key={bucket.key}>
            <TableCell>
              {bucket.fullLabel}
              {bucket.partial && <span className="text-muted-foreground"> (laufend)</span>}
            </TableCell>
            {series.map((s, seriesIndex) => (
              <TableCell key={s.id} className="text-right tabular-nums">
                {formatNumber(values[seriesIndex]![index]!, unit.decimals)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DistributionTable({
  caption,
  slices,
  unit,
}: {
  caption: string;
  slices: DistributionSlice[];
  unit: ChartUnit;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Kategorie</TableHead>
          <TableHead scope="col" className="text-right">
            {unit.plural}
          </TableHead>
          <TableHead scope="col" className="text-right">
            Anteil
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {slices.map((slice) => (
          <TableRow key={slice.id}>
            <TableCell>{slice.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatNumber(slice.value, unit.decimals)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(total > 0 ? slice.value / total : 0)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
