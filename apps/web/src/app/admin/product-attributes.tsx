'use client';
import type { Assignment } from '@/lib/catalog';
import ReferencePicker from './reference-picker';
export default function ProductAttributes({
  value,
  onChange,
}: {
  value: Assignment[];
  onChange: (value: Assignment[]) => void;
}) {
  return (
    <div className="attribute-rows">
      {value.map((a, i) => (
        <div key={i} className="attribute-row">
          <ReferencePicker
            kind="attributes"
            label="Атрибут"
            value={a.attributeId}
            initialLabel={a.value?.attribute.name}
            onChange={(item) =>
              onChange(
                value.map((v, n) =>
                  n === i
                    ? {
                        attributeId: item?.id || '',
                        valueId: '',
                        value: item
                          ? {
                              label: '',
                              attribute: {
                                name: item.name || '',
                                measurementSymbol: null,
                              },
                            }
                          : undefined,
                      }
                    : v,
                ),
              )
            }
          />
          {a.attributeId && (
            <ReferencePicker
              key={a.attributeId}
              kind="attribute-values"
              attributeId={a.attributeId}
              label="Значення"
              value={a.valueId}
              initialLabel={a.value?.label}
              onChange={(item) =>
                onChange(
                  value.map((v, n) =>
                    n === i
                      ? {
                          ...v,
                          valueId: item?.id || '',
                          value: {
                            label: item?.label || '',
                            attribute: v.value?.attribute || {
                              name: '',
                              measurementSymbol: null,
                            },
                          },
                        }
                      : v,
                  ),
                )
              }
            />
          )}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            Прибрати атрибут
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.length >= 30}
        onClick={() => onChange([...value, { attributeId: '', valueId: '' }])}
      >
        Додати атрибут
      </button>
    </div>
  );
}
