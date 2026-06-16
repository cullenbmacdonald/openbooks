import {
  Button,
  Indicator,
  Loader,
  ScrollArea,
  Table,
  Text,
  Tooltip
} from "@mantine/core";
import { useElementSize, useMergedRef } from "@mantine/hooks";
import {
  createColumnHelper,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  Row,
  useReactTable
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MagnifyingGlass, User } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useGetServersQuery } from "../../state/api";
import { BookDetail } from "../../state/messages";
import { sendDownload } from "../../state/stateSlice";
import { RootState, useAppDispatch } from "../../state/store";
import FacetFilter, {
  ServerFacetEntry,
  StandardFacetEntry
} from "./Filters/FacetFilter";
import { TextFilter } from "./Filters/TextFilter";
import { useTableStyles } from "./styles";

const columnHelper = createColumnHelper<BookDetail>();

const stringInArray: FilterFn<any> = (
  row,
  columnId: string,
  filterValue: string[] | undefined
) => {
  if (!filterValue || filterValue.length === 0) return true;

  return filterValue.includes(row.getValue<string>(columnId));
};

interface BookTableProps {
  books: BookDetail[];
}

export default function BookTable({ books }: BookTableProps) {
  const { classes, cx, theme } = useTableStyles();
  const { data: servers } = useGetServersQuery(null);

  const { ref: elementSizeRef, height, width } = useElementSize();
  const virtualizerRef = useRef<HTMLDivElement>(null);
  const mergedRef = useMergedRef(elementSizeRef, virtualizerRef);

  const columns = useMemo(() => {
    const cols = (cols: number) => (width / 12) * cols;
    return [
      columnHelper.accessor("server", {
        header: (props) => (
          <FacetFilter
            placeholder="Server"
            column={props.column}
            table={props.table}
            Entry={ServerFacetEntry}
          />
        ),
        cell: (props) => {
          const online = servers?.includes(props.getValue());
          return (
            <Text size="12px" fw="normal" c="dark" style={{ marginLeft: 20 }}>
              <Tooltip
                position="top-start"
                label={online ? "Online" : "Offline"}>
                <Indicator
                  zIndex={0}
                  position="middle-start"
                  offset={-16}
                  size={6}
                  color={online ? "green.6" : "gray"}>
                  {props.getValue()}
                </Indicator>
              </Tooltip>
            </Text>
          );
        },
        size: cols(1),
        enableColumnFilter: true,
        filterFn: stringInArray
      }),
      columnHelper.accessor("author", {
        header: (props) => (
          <TextFilter
            icon={<User weight="bold" />}
            placeholder="Author"
            column={props.column}
            table={props.table}
          />
        ),
        size: cols(2),
        enableColumnFilter: false
      }),
      columnHelper.accessor("title", {
        header: (props) => (
          <TextFilter
            icon={<MagnifyingGlass weight="bold" />}
            placeholder="Title"
            column={props.column}
            table={props.table}
          />
        ),
        minSize: 20,
        size: cols(6),
        enableColumnFilter: false
      }),
      columnHelper.accessor("format", {
        header: (props) => (
          <FacetFilter
            placeholder="Format"
            column={props.column}
            table={props.table}
            Entry={StandardFacetEntry}
          />
        ),
        size: cols(1),
        enableColumnFilter: false,
        filterFn: stringInArray
      }),
      columnHelper.accessor("size", {
        header: "Size",
        size: cols(1),
        enableColumnFilter: false
      }),
      columnHelper.display({
        id: "download",
        header: "Download",
        size: cols(1),
        enableColumnFilter: false,
        cell: ({ row }) => (
          <DownloadButton book={row.original.full}></DownloadButton>
        )
      })
    ];
  }, [width, servers]);

  const table = useReactTable({
    data: books,
    columns: columns,
    enableFilters: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues()
  });

  const { rows: tableRows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => virtualizerRef.current,
    estimateSize: () => 50,
    overscan: 10
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const paddingTop =
    virtualItems.length > 0 ? virtualItems?.[0]?.start || 0 : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualItems?.[virtualItems.length - 1]?.end || 0)
      : 0;

  return (
    <ScrollArea
      viewportRef={mergedRef}
      className={classes.container}
      type="hover"
      scrollbarSize={6}
      styles={{ thumb: { ["&::before"]: { minWidth: 4 } } }}
      offsetScrollbars={false}>
      <Table highlightOnHover verticalSpacing="sm" fz="xs">
        <Table.Thead className={classes.head}>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.Th
                  key={header.id}
                  className={classes.headerCell}
                  style={{
                    width: header.getSize()
                  }}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={cx(classes.resizer, {
                      ["isResizing"]: header.column.getIsResizing()
                    })}
                  />
                </Table.Th>
              ))}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {paddingTop > 0 && (
            <Table.Tr>
              <Table.Td style={{ height: `${paddingTop}px` }} />
            </Table.Tr>
          )}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = tableRows[
              virtualRow.index
            ] as unknown as Row<BookDetail>;
            return (
              <Table.Tr key={row.id} style={{ height: 50 }}>
                {row.getVisibleCells().map((cell) => {
                  const content = flexRender(
                    cell.column.columnDef.cell,
                    cell.getContext()
                  );
                  return (
                    <Table.Td key={cell.id}>
                      {cell.column.id === "download" ? (
                        content
                      ) : (
                        <Text lineClamp={1} c="dark">
                          {content}
                        </Text>
                      )}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            );
          })}
          {paddingBottom > 0 && (
            <Table.Tr>
              <Table.Td style={{ height: `${paddingBottom}px` }} />
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

function DownloadButton({ book }: { book: string }) {
  const dispatch = useAppDispatch();

  const [clicked, setClicked] = useState(false);
  const isInFlight = useSelector((state: RootState) =>
    state.state.inFlightDownloads.includes(book)
  );

  // Prevent hitting the same button multiple times
  const onClick = () => {
    if (clicked) return;
    dispatch(sendDownload(book));
    setClicked(true);
  };

  return (
    <Button
      size="compact-xs"
      radius="sm"
      onClick={onClick}
      style={{ fontWeight: "normal", width: 80 }}>
      {isInFlight ? (
        <Loader variant="dots" color="gray" />
      ) : (
        <span>Download</span>
      )}
    </Button>
  );
}
